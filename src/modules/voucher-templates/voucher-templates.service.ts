import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '@database/prisma.service';
import {
  buildPaginatedResult,
  calculateSkip,
} from '@shared/utils/pagination.util';
import { PAGINATION } from '@shared/constants/global.constant';
import {
  CreateVoucherTemplateDto,
  UpdateVoucherTemplateDto,
  QueryTemplatesDto,
  VoucherType,
  DiscountType,
} from './dto/voucher-templates.dto';

@Injectable()
export class VoucherTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

  async createTemplate(dto: CreateVoucherTemplateDto, lang = 'en') {
    const event = await this.prisma.event.findUnique({
      where: { id: dto.eventId },
    });

    if (!event) {
      throw new NotFoundException(
        this.i18n.translate('event.not_found', { lang }),
      );
    }

    if (dto.code) {
      const existingTemplate = await this.prisma.voucherTemplate.findUnique({
        where: { code: dto.code },
      });

      if (existingTemplate) {
        throw new ConflictException(
          this.i18n.translate('voucher.template_code_exists', { lang }),
        );
      }
    }

    if (dto.discountType === DiscountType.PERCENTAGE) {
      if (dto.discountValue > 100 || dto.discountValue < 0) {
        throw new BadRequestException(
          this.i18n.translate('voucher.invalid_percentage', { lang }),
        );
      }
    }

    if (dto.discountType === DiscountType.FREE_SHIPPING) {
      if (dto.discountValue <= 0) {
        throw new BadRequestException(
          'FREE_SHIPPING discount value must be positive',
        );
      }
      if (dto.maxDiscountAmount) {
        throw new BadRequestException(
          'maxDiscountAmount is not applicable for FREE_SHIPPING vouchers',
        );
      }
    }

    if (dto.type === VoucherType.MULTI_USE && !dto.maxUsageCount) {
      throw new BadRequestException(
        this.i18n.translate('voucher.multi_use_requires_max_usage', { lang }),
      );
    }

    const template = await this.prisma.voucherTemplate.create({
      data: {
        eventId: dto.eventId,
        name: dto.name,
        description: dto.description,
        code: dto.code,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        minOrderAmount: dto.minOrderAmount,
        maxDiscountAmount: dto.maxDiscountAmount,
        type: dto.type,
        maxUsageCount: dto.maxUsageCount,
        maxPerUser: dto.maxPerUser,
        maxIssue: dto.maxIssue,
        targetUserIds: dto.targetUserIds || [],
        isActive: dto.isActive ?? true,
        issuedCount: 0,
      },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            startDate: true,
            endDate: true,
          },
        },
      },
    });

    return template;
  }

  async updateTemplate(
    templateId: string,
    dto: UpdateVoucherTemplateDto,
    lang = 'en',
  ) {
    const template = await this.prisma.voucherTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException(
        this.i18n.translate('voucher.template_not_found', { lang }),
      );
    }

    if (dto.discountType === DiscountType.PERCENTAGE && dto.discountValue) {
      if (dto.discountValue > 100 || dto.discountValue < 0) {
        throw new BadRequestException(
          this.i18n.translate('voucher.invalid_percentage', { lang }),
        );
      }
    }

    if (dto.discountType === DiscountType.FREE_SHIPPING && dto.discountValue) {
      if (dto.discountValue <= 0) {
        throw new BadRequestException(
          'FREE_SHIPPING discount value must be positive',
        );
      }
    }

    const updated = await this.prisma.voucherTemplate.update({
      where: { id: templateId },
      data: dto,
      include: {
        event: {
          select: { id: true, title: true },
        },
        _count: {
          select: { voucherInstances: true },
        },
      },
    });

    return updated;
  }

  async getTemplateById(templateId: string, lang = 'en') {
    const template = await this.prisma.voucherTemplate.findUnique({
      where: { id: templateId },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            startDate: true,
            endDate: true,
            isActive: true,
          },
        },
        _count: {
          select: { voucherInstances: true },
        },
      },
    });

    if (!template) {
      throw new NotFoundException(
        this.i18n.translate('voucher.template_not_found', { lang }),
      );
    }

    return {
      ...template,
      availableToIssue: template.maxIssue - template.issuedCount,
    };
  }

  async getAllTemplates(query: QueryTemplatesDto) {
    const {
      page = 1,
      limit = PAGINATION.DEFAULT_PAGE_SIZE,
      eventId,
      type,
      isActive,
    } = query;

    const where: any = {};

    if (eventId) {
      where.eventId = eventId;
    }

    if (type) {
      where.type = type;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const skip = calculateSkip(page, limit);

    const [templates, total] = await Promise.all([
      this.prisma.voucherTemplate.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          event: {
            select: { id: true, title: true, startDate: true, endDate: true },
          },
          _count: {
            select: { voucherInstances: true },
          },
        },
      }),
      this.prisma.voucherTemplate.count({ where }),
    ]);

    return buildPaginatedResult(templates, total, { page, limit });
  }

  async getEventTemplates(eventId: string, lang = 'en') {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException(
        this.i18n.translate('event.not_found', { lang }),
      );
    }

    const templates = await this.prisma.voucherTemplate.findMany({
      where: {
        eventId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        code: true,
        discountType: true,
        discountValue: true,
        minOrderAmount: true,
        maxDiscountAmount: true,
        type: true,
        maxPerUser: true,
        issuedCount: true,
        maxIssue: true,
        isActive: true,
      },
    });

    return templates.map((t) => ({
      ...t,
      availableToIssue: t.maxIssue - t.issuedCount,
    }));
  }

  async deleteTemplate(templateId: string, lang = 'en') {
    const template = await this.prisma.voucherTemplate.findUnique({
      where: { id: templateId },
      include: {
        _count: {
          select: { voucherInstances: true },
        },
      },
    });

    if (!template) {
      throw new NotFoundException(
        this.i18n.translate('voucher.template_not_found', { lang }),
      );
    }

    if (template._count.voucherInstances > 0) {
      throw new ConflictException(
        this.i18n.translate('voucher.cannot_delete_template_with_instances', {
          lang,
        }),
      );
    }

    await this.prisma.voucherTemplate.delete({
      where: { id: templateId },
    });

    return { success: true };
  }

  async getTemplateStats(templateId: string, lang = 'en') {
    const template = await this.prisma.voucherTemplate.findUnique({
      where: { id: templateId },
      include: {
        voucherInstances: {
          select: {
            status: true,
            usedCount: true,
          },
        },
      },
    });

    if (!template) {
      throw new NotFoundException(
        this.i18n.translate('voucher.template_not_found', { lang }),
      );
    }

    const activeInstances = template.voucherInstances.filter(
      (v) => v.status === 'ACTIVE',
    ).length;

    const usedInstances = template.voucherInstances.filter(
      (v) => v.status === 'USED',
    ).length;

    const expiredInstances = template.voucherInstances.filter(
      (v) => v.status === 'EXPIRED',
    ).length;

    const totalUsages = template.voucherInstances.reduce(
      (sum, v) => sum + v.usedCount,
      0,
    );

    return {
      templateId: template.id,
      templateName: template.name,
      totalIssued: template.issuedCount,
      maxIssue: template.maxIssue,
      availableToIssue: template.maxIssue - template.issuedCount,
      activeInstances,
      usedInstances,
      expiredInstances,
      totalUsages,
    };
  }
}
