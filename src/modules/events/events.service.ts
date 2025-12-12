import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '@database/prisma.service';
import { EditLocksService } from '../edit-locks/edit-locks.service';
import {
  buildPaginatedResult,
  calculateSkip,
} from '@shared/utils/pagination.util';
import {
  CreateEventDto,
  UpdateEventDto,
  QueryEventsDto,
} from './dto/events.dto';
import { PAGINATION, FIELDS } from '@shared/constants/global.constant';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
    private readonly editLocksService: EditLocksService,
  ) {}

  async createEvent(dto: CreateEventDto, userId: string, lang = 'en') {
    const slug = this.generateSlug(dto.title);

    const existingEvent = await this.prisma.event.findUnique({
      where: { slug },
    });

    const event = await this.prisma.event.create({
      data: {
        ...dto,
        slug: existingEvent ? `${slug}-${Date.now()}` : slug,
        createdBy: userId,
        issuedCount: 0,
      },
      include: {
        creator: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    return event;
  }

  async getEvents(query: QueryEventsDto) {
    const {
      page = 1,
      limit = PAGINATION.DEFAULT_PAGE_SIZE,
      status,
      sortBy = FIELDS.DEFAULT_SORT_FIELD,
      sortOrder = 'desc',
    } = query;

    const where: any = {};

    if (status) {
      const now = new Date();
      if (status === 'upcoming') {
        where.startDate = { gt: now };
      } else if (status === 'active') {
        where.AND = [{ startDate: { lte: now } }, { endDate: { gte: now } }];
      } else if (status === 'ended') {
        where.endDate = { lt: now };
      }
    }

    const skip = calculateSkip(page, limit);

    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          creator: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          _count: {
            select: { voucherTemplates: true },
          },
        },
      }),
      this.prisma.event.count({ where }),
    ]);

    return buildPaginatedResult(events, total, { page, limit });
  }

  async getEventById(eventId: string, lang = 'en') {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        creator: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        _count: {
          select: { voucherTemplates: true },
        },
      },
    });

    if (!event) {
      throw new NotFoundException(
        this.i18n.translate('event.not_found', { lang }),
      );
    }

    return event;
  }

  async getUserEvents(userId: string, query: QueryEventsDto) {
    const {
      page = 1,
      limit = PAGINATION.DEFAULT_PAGE_SIZE,
      sortBy = FIELDS.DEFAULT_SORT_FIELD,
      sortOrder = 'desc',
    } = query;

    const where = { createdBy: userId };
    const skip = calculateSkip(page, limit);

    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          _count: {
            select: { voucherTemplates: true },
          },
        },
      }),
      this.prisma.event.count({ where }),
    ]);

    return buildPaginatedResult(events, total, { page, limit });
  }

  async updateEvent(
    eventId: string,
    dto: UpdateEventDto,
    userId: string,
    userEmail: string,
    lang = 'en',
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException(
        this.i18n.translate('event.not_found', { lang }),
      );
    }

    // if (event.createdBy !== userId) {
    //   throw new ForbiddenException(
    //     this.i18n.translate('auth.permission_denied', { lang }),
    //   );
    // }

    await this.editLocksService.acquireLock(
      'event',
      eventId,
      userId,
      userEmail,
      lang,
    );

    const updateData: any = { ...dto };
    if (dto.title && dto.title !== event.title) {
      updateData.slug = this.generateSlug(dto.title);
    }

    const updatedEvent = await this.prisma.event.update({
      where: { id: eventId },
      data: updateData,
      include: {
        creator: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    return updatedEvent;
  }

  async deleteEvent(eventId: string, userId: string, lang = 'en') {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException(
        this.i18n.translate('event.not_found', { lang }),
      );
    }

    // if (event.createdBy !== userId) {
    //   throw new ForbiddenException(
    //     this.i18n.translate('auth.permission_denied', { lang }),
    //   );
    // }

    const templateCount = await this.prisma.voucherTemplate.count({
      where: { eventId },
    });

    if (templateCount > 0) {
      throw new ConflictException(
        this.i18n.translate('event.cannot_delete_with_templates', { lang }),
      );
    }

    await this.prisma.event.delete({
      where: { id: eventId },
    });
  }

  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }
}
