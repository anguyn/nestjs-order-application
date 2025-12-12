import { Injectable, ConflictException } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma.service';

@Injectable()
export class EditLocksService {
  private readonly lockDuration: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
    private readonly config: ConfigService,
  ) {
    this.lockDuration = this.config.get<number>('EDIT_LOCK_DURATION', 300000);
  }

  async acquireLock(
    resourceType: 'event' | 'product',
    resourceId: string,
    userId: string,
    userEmail: string,
    lang = 'en',
  ) {
    const whereClause = this.buildWhereClause(resourceType, resourceId);

    const existingLock = await this.prisma.editLock.findFirst({
      where: whereClause,
    });

    const now = new Date();

    if (existingLock) {
      if (existingLock.expiresAt < now) {
        // Lock expired, delete and create new
        await this.prisma.editLock.delete({
          where: { id: existingLock.id },
        });
      } else if (existingLock.userId === userId) {
        // User already owns lock, extend it
        return this.prisma.editLock.update({
          where: { id: existingLock.id },
          data: {
            expiresAt: new Date(Date.now() + Number(this.lockDuration)),
          },
        });
      } else {
        // Lock owned by another user
        throw new ConflictException(
          this.i18n.translate(`${resourceType}.already_locked`, {
            lang,
            args: { email: existingLock.userEmail },
          }),
        );
      }
    }

    // Create new lock
    const createData: any = {
      resourceType,
      userId,
      userEmail,
      expiresAt: new Date(Date.now() + Number(this.lockDuration)),
    };

    if (resourceType === 'event') {
      createData.eventId = resourceId;
    } else {
      createData.productId = resourceId;
    }

    return this.prisma.editLock.create({
      data: createData,
    });
  }

  async releaseLock(
    resourceType: 'event' | 'product',
    resourceId: string,
    userId: string,
    lang = 'en',
  ) {
    const whereClause = this.buildWhereClause(resourceType, resourceId);

    const lock = await this.prisma.editLock.findFirst({
      where: whereClause,
    });

    if (!lock) {
      return;
    }

    if (lock.userId !== userId) {
      throw new ConflictException(
        this.i18n.translate(`${resourceType}.not_locked_by_you`, { lang }),
      );
    }

    await this.prisma.editLock.delete({
      where: { id: lock.id },
    });
  }

  async maintainLock(
    resourceType: 'event' | 'product',
    resourceId: string,
    userId: string,
    lang = 'en',
  ) {
    const whereClause = this.buildWhereClause(resourceType, resourceId);

    const lock = await this.prisma.editLock.findFirst({
      where: whereClause,
    });

    if (!lock) {
      throw new ConflictException(
        this.i18n.translate(`${resourceType}.lock_expired`, { lang }),
      );
    }

    const now = new Date();
    if (lock.expiresAt < now) {
      await this.prisma.editLock.delete({
        where: { id: lock.id },
      });
      throw new ConflictException(
        this.i18n.translate(`${resourceType}.lock_expired`, { lang }),
      );
    }

    if (lock.userId !== userId) {
      throw new ConflictException(
        this.i18n.translate(`${resourceType}.not_locked_by_you`, { lang }),
      );
    }

    return this.prisma.editLock.update({
      where: { id: lock.id },
      data: {
        expiresAt: new Date(Date.now() + Number(this.lockDuration)),
      },
    });
  }

  async getLockInfo(resourceType: 'event' | 'product', resourceId: string) {
    const whereClause = this.buildWhereClause(resourceType, resourceId);

    const lock = await this.prisma.editLock.findFirst({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!lock) {
      return null;
    }

    const now = new Date();
    if (lock.expiresAt < now) {
      await this.prisma.editLock.delete({
        where: { id: lock.id },
      });
      return null;
    }

    return lock;
  }

  private buildWhereClause(
    resourceType: 'event' | 'product',
    resourceId: string,
  ) {
    if (resourceType === 'event') {
      return {
        resourceType,
        eventId: resourceId,
      };
    } else {
      return {
        resourceType,
        productId: resourceId,
      };
    }
  }
}
