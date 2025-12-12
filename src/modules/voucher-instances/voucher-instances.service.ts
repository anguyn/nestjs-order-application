import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '@database/prisma.service';
import { generateVoucherCode } from '@shared/utils/voucher.util';
import {
  buildPaginatedResult,
  calculateSkip,
} from '@shared/utils/pagination.util';
import { PAGINATION } from '@shared/constants/global.constant';
import { Prisma } from '@generated/prisma/client';
import {
  ClaimVoucherDto,
  ValidateVoucherDto,
  QueryMyVouchersDto,
  VoucherStatus,
} from './dto/voucher-instances.dto';
import {
  VoucherType,
  DiscountType,
} from '../voucher-templates/dto/voucher-templates.dto';

const SHIPPING_FEE = 30000; // Default shipping fee

@Injectable()
export class VoucherInstancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

  async claimVoucher(userId: string, dto: ClaimVoucherDto, lang = 'en') {
    return await this.prisma.$transaction(async (tx) => {
      const template = await tx.voucherTemplate.findUnique({
        where: { id: dto.templateId },
        include: { event: true },
      });

      if (!template) {
        throw new NotFoundException(
          this.i18n.translate('voucher.template_not_found', { lang }),
        );
      }

      if (!template.isActive) {
        throw new BadRequestException(
          this.i18n.translate('voucher.template_not_active', { lang }),
        );
      }

      const event = template.event;
      if (!event.isActive) {
        throw new BadRequestException(
          this.i18n.translate('event.not_active', { lang }),
        );
      }

      const now = new Date();
      if (now < event.startDate) {
        throw new BadRequestException(
          this.i18n.translate('event.not_started', { lang }),
        );
      }

      if (now > event.endDate) {
        throw new BadRequestException(
          this.i18n.translate('event.ended', { lang }),
        );
      }

      if (template.issuedCount >= template.maxIssue) {
        throw new ConflictException(
          this.i18n.translate('voucher.template_sold_out', { lang }),
        );
      }

      if (event.issuedCount >= event.maxVouchers) {
        throw new ConflictException(
          this.i18n.translate('voucher.event_sold_out', { lang }),
        );
      }

      if (template.type === VoucherType.SPECIFIC_USER) {
        if (
          template.targetUserIds.length > 0 &&
          !template.targetUserIds.includes(userId)
        ) {
          throw new BadRequestException(
            this.i18n.translate('voucher.not_eligible', { lang }),
          );
        }
      }

      if (template.maxPerUser) {
        const userClaimCount = await tx.voucherInstance.count({
          where: {
            templateId: dto.templateId,
            userId,
          },
        });

        if (userClaimCount >= template.maxPerUser) {
          throw new ConflictException(
            this.i18n.translate('voucher.max_per_user_reached', { lang }),
          );
        }
      }

      let code = generateVoucherCode();
      let attempts = 0;
      while (attempts < 5) {
        const existing = await tx.voucherInstance.findUnique({
          where: { code },
        });
        if (!existing) break;
        code = generateVoucherCode();
        attempts++;
      }

      if (attempts === 5) {
        throw new ConflictException(
          this.i18n.translate('voucher.code_generation_failed', { lang }),
        );
      }

      await Promise.all([
        tx.voucherTemplate.update({
          where: { id: dto.templateId },
          data: { issuedCount: { increment: 1 } },
        }),
        tx.event.update({
          where: { id: event.id },
          data: { issuedCount: { increment: 1 } },
        }),
      ]);

      const expiresAt = new Date(event.endDate);
      const instance = await tx.voucherInstance.create({
        data: {
          templateId: dto.templateId,
          userId,
          code,
          expiresAt,
          status: VoucherStatus.ACTIVE,
          usedCount: 0,
        },
        include: {
          template: {
            select: {
              id: true,
              name: true,
              description: true,
              discountType: true,
              discountValue: true,
              minOrderAmount: true,
              maxDiscountAmount: true,
              type: true,
              maxUsageCount: true,
            },
          },
        },
      });

      return instance;
    });
  }

  async validateVoucher(userId: string, dto: ValidateVoucherDto, lang = 'en') {
    const instance = await this.prisma.voucherInstance.findUnique({
      where: { code: dto.code },
      include: {
        template: {
          include: { event: true },
        },
      },
    });

    if (!instance) {
      throw new NotFoundException(
        this.i18n.translate('voucher.not_found', { lang }),
      );
    }

    if (instance.userId !== userId) {
      throw new BadRequestException(
        this.i18n.translate('voucher.not_yours', { lang }),
      );
    }

    if (instance.status !== VoucherStatus.ACTIVE) {
      throw new BadRequestException(
        this.i18n.translate('voucher.not_active', {
          lang,
          args: { status: instance.status },
        }),
      );
    }

    if (new Date() > instance.expiresAt) {
      await this.prisma.voucherInstance.update({
        where: { id: instance.id },
        data: { status: VoucherStatus.EXPIRED },
      });
      throw new BadRequestException(
        this.i18n.translate('voucher.expired', { lang }),
      );
    }

    const template = instance.template;

    if (
      template.minOrderAmount &&
      dto.orderAmount < Number(template.minOrderAmount)
    ) {
      throw new BadRequestException(
        this.i18n.translate('voucher.min_order_not_met', {
          lang,
          args: { amount: template.minOrderAmount.toString() },
        }),
      );
    }

    if (template.type === VoucherType.SINGLE_USE && instance.usedCount > 0) {
      throw new BadRequestException(
        this.i18n.translate('voucher.already_used', { lang }),
      );
    }

    if (template.type === VoucherType.MULTI_USE) {
      if (
        template.maxUsageCount &&
        instance.usedCount >= template.maxUsageCount
      ) {
        throw new BadRequestException(
          this.i18n.translate('voucher.usage_limit_reached', { lang }),
        );
      }
    }

    // Calculate discount based on type
    let discount = 0;

    if (template.discountType === DiscountType.FREE_SHIPPING) {
      // FREE_SHIPPING: discount on shipping fee only
      discount = Math.min(Number(template.discountValue), SHIPPING_FEE);
    } else if (template.discountType === DiscountType.FIXED) {
      // FIXED: fixed amount discount on products
      discount = Number(template.discountValue);
    } else if (template.discountType === DiscountType.PERCENTAGE) {
      // PERCENTAGE: percentage discount on products
      discount = (dto.orderAmount * Number(template.discountValue)) / 100;
    }

    // Apply max discount cap (not for FREE_SHIPPING)
    if (
      template.discountType !== DiscountType.FREE_SHIPPING &&
      template.maxDiscountAmount &&
      discount > Number(template.maxDiscountAmount)
    ) {
      discount = Number(template.maxDiscountAmount);
    }

    // Don't let discount exceed order amount (for product discounts)
    if (
      template.discountType !== DiscountType.FREE_SHIPPING &&
      discount > dto.orderAmount
    ) {
      discount = dto.orderAmount;
    }

    return {
      isValid: true,
      voucher: {
        id: instance.id,
        code: instance.code,
        templateName: template.name,
        discountType: template.discountType,
        discountValue: template.discountValue,
      },
      discount,
      finalAmount: dto.orderAmount - discount, // This is for display only
    };
  }

  /**
   * Apply voucher when creating order
   * Returns discount amount and voucher instance
   */
  async applyVoucher(
    code: string,
    orderAmount: number,
    userId: string,
    orderId: string,
    tx: Prisma.TransactionClient,
    lang = 'en',
  ) {
    const instance = await tx.voucherInstance.findUnique({
      where: { code },
      include: { template: true },
    });

    if (!instance || instance.userId !== userId) {
      throw new BadRequestException(
        this.i18n.translate('voucher.invalid', { lang }),
      );
    }

    if (instance.status !== VoucherStatus.ACTIVE) {
      throw new BadRequestException(
        this.i18n.translate('voucher.not_active', { lang }),
      );
    }

    if (new Date() > instance.expiresAt) {
      throw new BadRequestException(
        this.i18n.translate('voucher.expired', { lang }),
      );
    }

    const template = instance.template;

    if (
      template.minOrderAmount &&
      orderAmount < Number(template.minOrderAmount)
    ) {
      throw new BadRequestException(
        this.i18n.translate('voucher.min_order_not_met', {
          lang,
          args: { amount: template.minOrderAmount.toString() },
        }),
      );
    }

    if (template.type === VoucherType.SINGLE_USE && instance.usedCount > 0) {
      throw new BadRequestException(
        this.i18n.translate('voucher.already_used', { lang }),
      );
    }

    if (template.type === VoucherType.MULTI_USE) {
      if (
        template.maxUsageCount &&
        instance.usedCount >= template.maxUsageCount
      ) {
        throw new BadRequestException(
          this.i18n.translate('voucher.usage_limit_reached', { lang }),
        );
      }
    }

    // Calculate discount based on type
    let discount = 0;

    if (template.discountType === DiscountType.FREE_SHIPPING) {
      // FREE_SHIPPING: discount on shipping fee only
      discount = Math.min(Number(template.discountValue), SHIPPING_FEE);
    } else if (template.discountType === DiscountType.FIXED) {
      // FIXED: fixed amount on products
      discount = Number(template.discountValue);
    } else if (template.discountType === DiscountType.PERCENTAGE) {
      // PERCENTAGE: percentage on products
      discount = (orderAmount * Number(template.discountValue)) / 100;
    }

    // Apply max discount cap (not for FREE_SHIPPING)
    if (
      template.discountType !== DiscountType.FREE_SHIPPING &&
      template.maxDiscountAmount &&
      discount > Number(template.maxDiscountAmount)
    ) {
      discount = Number(template.maxDiscountAmount);
    }

    // Don't let product discount exceed order amount
    if (
      template.discountType !== DiscountType.FREE_SHIPPING &&
      discount > orderAmount
    ) {
      discount = orderAmount;
    }

    // Update voucher instance
    const shouldMarkAsUsed =
      template.type === VoucherType.SINGLE_USE ||
      (template.type === VoucherType.MULTI_USE &&
        instance.usedCount + 1 >= (template.maxUsageCount || Infinity));

    await tx.voucherInstance.update({
      where: { id: instance.id },
      data: {
        usedCount: { increment: 1 },
        lastUsedAt: new Date(),
        status: shouldMarkAsUsed ? VoucherStatus.USED : VoucherStatus.ACTIVE,
      },
    });

    // Record usage
    await tx.voucherUsage.create({
      data: {
        voucherInstanceId: instance.id,
        userId,
        orderId,
        orderAmount,
        discountApplied: discount, // This is correct now - actual discount amount
      },
    });

    return {
      discount,
      voucher: instance,
    };
  }

  async getMyVouchers(userId: string, query: QueryMyVouchersDto) {
    const {
      page = 1,
      limit = PAGINATION.DEFAULT_PAGE_SIZE,
      status,
      eventId,
    } = query;

    const where: any = { userId };

    if (status) {
      where.status = status;
    }

    if (eventId) {
      where.template = { eventId };
    }

    const skip = calculateSkip(page, limit);

    const [instances, total] = await Promise.all([
      this.prisma.voucherInstance.findMany({
        where,
        skip,
        take: limit,
        orderBy: { issuedAt: 'desc' },
        include: {
          template: {
            select: {
              id: true,
              name: true,
              description: true,
              discountType: true,
              discountValue: true,
              minOrderAmount: true,
              maxDiscountAmount: true,
              type: true,
              maxUsageCount: true,
              event: {
                select: { id: true, title: true },
              },
            },
          },
        },
      }),
      this.prisma.voucherInstance.count({ where }),
    ]);

    return buildPaginatedResult(instances, total, { page, limit });
  }

  async getVoucherByCode(code: string, userId: string, lang = 'en') {
    const instance = await this.prisma.voucherInstance.findUnique({
      where: { code },
      include: {
        template: {
          include: {
            event: {
              select: { id: true, title: true, description: true },
            },
          },
        },
        usages: {
          orderBy: { usedAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!instance) {
      throw new NotFoundException(
        this.i18n.translate('voucher.not_found', { lang }),
      );
    }

    if (instance.userId !== userId) {
      throw new BadRequestException(
        this.i18n.translate('voucher.not_yours', { lang }),
      );
    }

    return instance;
  }

  async revokeVoucher(instanceId: string, lang = 'en') {
    const instance = await this.prisma.voucherInstance.findUnique({
      where: { id: instanceId },
    });

    if (!instance) {
      throw new NotFoundException(
        this.i18n.translate('voucher.not_found', { lang }),
      );
    }

    if (instance.status === VoucherStatus.USED) {
      throw new BadRequestException(
        this.i18n.translate('voucher.cannot_revoke_used', { lang }),
      );
    }

    await this.prisma.voucherInstance.update({
      where: { id: instanceId },
      data: { status: VoucherStatus.REVOKED },
    });

    return { success: true };
  }

  async markExpiredVouchers() {
    const now = new Date();

    const result = await this.prisma.voucherInstance.updateMany({
      where: {
        status: VoucherStatus.ACTIVE,
        expiresAt: { lt: now },
      },
      data: {
        status: VoucherStatus.EXPIRED,
      },
    });

    return { markedExpired: result.count };
  }
}
