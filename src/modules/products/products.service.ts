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
  CreateProductDto,
  UpdateProductDto,
  QueryProductsDto,
} from './dto/products.dto';
import { ProductStatus } from '@generated/prisma/client';
import { PAGINATION, FIELDS } from '@shared/constants/global.constant';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
    private readonly editLocksService: EditLocksService,
  ) {}

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  async createProduct(dto: CreateProductDto, userId: string, lang = 'en') {
    const slug = this.generateSlug(dto.name);

    const existingProduct = await this.prisma.product.findUnique({
      where: { slug },
    });

    if (existingProduct) {
      const uniqueSlug = `${slug}-${Date.now()}`;
      return this.prisma.product.create({
        data: {
          ...dto,
          slug: uniqueSlug,
          price: dto.price,
          comparePrice: dto.comparePrice ? dto.comparePrice : null,
          createdBy: userId,
        },
        include: {
          creator: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });
    }

    return this.prisma.product.create({
      data: {
        ...dto,
        slug,
        price: dto.price,
        comparePrice: dto.comparePrice ? dto.comparePrice : null,
        createdBy: userId,
      },
      include: {
        creator: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async getProducts(query: QueryProductsDto) {
    const {
      page = 1,
      limit = PAGINATION.DEFAULT_PAGE_SIZE,
      search,
      status,
      sortBy = FIELDS.DEFAULT_SORT_FIELD,
      sortOrder,
    } = query;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) {
      where.status = status;
    }

    const skip = calculateSkip(page, limit);

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          creator: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return buildPaginatedResult(products, total, { page, limit });
  }

  async getProductById(productId: string, lang = 'en') {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        creator: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(
        this.i18n.translate('product.not_found', { lang }),
      );
    }

    return product;
  }

  async getProductBySlug(slug: string, lang = 'en') {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: {
        creator: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(
        this.i18n.translate('product.not_found', { lang }),
      );
    }

    return product;
  }

  async updateProduct(
    productId: string,
    dto: UpdateProductDto,
    userId: string,
    lang = 'en',
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(
        this.i18n.translate('product.not_found', { lang }),
      );
    }

    // if (product.createdBy !== userId) {
    //   throw new ForbiddenException(
    //     this.i18n.translate('auth.permission_denied', { lang }),
    //   );
    // }

    // Check edit lock
    await this.checkEditLock(productId, userId, lang);

    const updateData: any = { ...dto };

    if (dto.name) {
      updateData.slug = this.generateSlug(dto.name);
    }

    if (dto.price !== undefined) {
      updateData.price = dto.price;
    }

    if (dto.comparePrice !== undefined) {
      updateData.comparePrice = dto.comparePrice ? dto.comparePrice : null;
    }

    // Auto update status based on stock
    if (dto.stock !== undefined && dto.stock === 0) {
      updateData.status = ProductStatus.OUT_OF_STOCK;
    }

    return this.prisma.product.update({
      where: { id: productId },
      data: updateData,
      include: {
        creator: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async deleteProduct(productId: string, userId: string, lang = 'en') {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(
        this.i18n.translate('product.not_found', { lang }),
      );
    }

    // if (product.createdBy !== userId) {
    //   throw new ForbiddenException(
    //     this.i18n.translate('auth.permission_denied', { lang }),
    //   );
    // }

    // Check if product is in any orders
    const orderCount = await this.prisma.orderItem.count({
      where: { productId },
    });

    if (orderCount > 0) {
      throw new ConflictException(
        this.i18n.translate('product.cannot_delete_with_orders', { lang }),
      );
    }

    // Check edit lock
    await this.checkEditLock(productId, userId, lang);

    await this.prisma.product.delete({
      where: { id: productId },
    });

    // Clean up edit lock
    await this.prisma.editLock.deleteMany({
      where: {
        resourceType: 'product',
        productId: productId,
      },
    });
  }

  private async checkEditLock(productId: string, userId: string, lang = 'en') {
    const lock = await this.prisma.editLock.findFirst({
      where: {
        resourceType: 'product',
        productId: productId,
      },
    });

    if (!lock) {
      return;
    }

    const now = new Date();
    if (lock.expiresAt < now) {
      await this.prisma.editLock.delete({
        where: { id: lock.id },
      });
      return;
    }

    if (lock.userId !== userId) {
      throw new ConflictException(
        this.i18n.translate('product.already_locked', {
          lang,
          args: { email: lock.userEmail },
        }),
      );
    }
  }
}
