import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '@database/prisma.service';
import { hashPassword } from '@shared/utils/password.util';
import {
  buildPaginatedResult,
  calculateSkip,
} from '@shared/utils/pagination.util';
import { ROLE_PERMISSIONS } from '@shared/constants/permissions.constant';
import {
  UpdateProfileDto,
  UpdateUserRoleDto,
  UpdateUserPermissionsDto,
  ToggleUserStatusDto,
  AdminChangePasswordDto,
  QueryUsersDto,
} from './dto/users.dto';
import { PAGINATION } from '@shared/constants/global.constant';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

  async getAllUsers(query: QueryUsersDto, lang = 'en') {
    const { page, limit, search, role, isActive } = query;

    const where: any = {};

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role) {
      where.role = role;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const skip = calculateSkip(
      page || 1,
      limit || PAGINATION.DEFAULT_PAGE_SIZE,
    );

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          permissions: true,
          language: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return buildPaginatedResult(users, total, { page, limit });
  }

  async getUserById(userId: string, lang = 'en') {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        permissions: true,
        language: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException(
        this.i18n.translate('user.not_found', { lang }),
      );
    }

    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto, lang = 'en') {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        permissions: true,
        language: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user;
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    lang = 'en',
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(
        this.i18n.translate('user.not_found', { lang }),
      );
    }

    const { comparePassword } = await import('@shared/utils/password.util.js');
    const isValid = await comparePassword(currentPassword, user.password);

    if (!isValid) {
      throw new ForbiddenException(
        this.i18n.translate('user.current_password_incorrect', { lang }),
      );
    }

    const hashedPassword = await hashPassword(newPassword);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    await this.prisma.refreshToken.deleteMany({
      where: { userId },
    });
  }

  async updateUserRole(userId: string, dto: UpdateUserRoleDto, lang = 'en') {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(
        this.i18n.translate('user.not_found', { lang }),
      );
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        role: dto.role,
        permissions: ROLE_PERMISSIONS[dto.role],
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        permissions: true,
        language: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async updateUserPermissions(
    userId: string,
    dto: UpdateUserPermissionsDto,
    lang = 'en',
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(
        this.i18n.translate('user.not_found', { lang }),
      );
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { permissions: dto.permissions },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        permissions: true,
        language: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async toggleUserStatus(
    userId: string,
    dto: ToggleUserStatusDto,
    lang = 'en',
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(
        this.i18n.translate('user.not_found', { lang }),
      );
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: dto.isActive },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        permissions: true,
        language: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!dto.isActive) {
      await this.prisma.refreshToken.deleteMany({
        where: { userId },
      });
    }

    return updatedUser;
  }

  async adminChangePassword(
    userId: string,
    dto: AdminChangePasswordDto,
    lang = 'en',
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(
        this.i18n.translate('user.not_found', { lang }),
      );
    }

    const hashedPassword = await hashPassword(dto.newPassword);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    await this.prisma.refreshToken.deleteMany({
      where: { userId },
    });
  }

  async deleteUser(userId: string, lang = 'en') {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(
        this.i18n.translate('user.not_found', { lang }),
      );
    }

    await this.prisma.user.delete({
      where: { id: userId },
    });
  }
}
