import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma.service';
import { VoucherInstancesService } from '../voucher-instances/voucher-instances.service';
import {
  buildPaginatedResult,
  calculateSkip,
} from '@shared/utils/pagination.util';
import {
  CreateOrderDto,
  QueryOrdersDto,
  UpdateOrderStatusDto,
} from './dto/orders.dto';
import {
  OrderStatus,
  ProductStatus,
  DiscountType,
  Address,
} from '@generated/prisma/client';
import { PAGINATION, FIELDS } from '@shared/constants/global.constant';

const SHIPPING_FEE = 30000; // Default shipping fee

interface OrderItem {
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  subtotal: number;
}

@Injectable()
export class OrdersService {
  private readonly orderExpiryMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
    private readonly voucherInstancesService: VoucherInstancesService,
    private readonly config: ConfigService,
    @InjectQueue('email') private emailQueue: Queue,
  ) {
    this.orderExpiryMinutes = this.config.get<number>(
      'ORDER_EXPIRY_MINUTES',
      15,
    );
  }

  private generateOrderNumber(): string {
    return `ORDER-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
  }

  async createOrder(userId: string, dto: CreateOrderDto, lang = 'en') {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Validate address (addressText OR addressId required)
      if (!dto.addressText && !dto.addressId) {
        throw new BadRequestException(
          this.i18n.translate('order.address_required', { lang }),
        );
      }

      let selectedAddress: Address | null = null;
      let finalAddressText = dto.addressText;

      if (dto.addressId) {
        selectedAddress = await tx.address.findFirst({
          where: {
            id: dto.addressId,
            userId,
          },
        });

        if (!selectedAddress) {
          throw new NotFoundException(
            this.i18n.translate('address.not_found', { lang }),
          );
        }

        // Generate addressText from Address model if not provided
        if (!finalAddressText) {
          finalAddressText = `${selectedAddress.fullName}, ${selectedAddress.phone}, ${selectedAddress.address}, ${selectedAddress.ward}, ${selectedAddress.district}, ${selectedAddress.city}`;
        }
      }

      // 2. Get cart with items
      const cart = await tx.cart.findUnique({
        where: { userId },
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      if (!cart || cart.items.length === 0) {
        throw new BadRequestException(
          this.i18n.translate('cart.cart_empty', { lang }),
        );
      }

      // 3. Validate stock and calculate subtotal
      let subtotal = 0;
      const orderItems: OrderItem[] = [];

      for (const item of cart.items) {
        const product = item.product;

        if (product.stock < item.quantity) {
          throw new BadRequestException(
            this.i18n.translate('product.insufficient_stock', {
              lang,
              args: { name: product.name },
            }),
          );
        }

        if (product.status !== ProductStatus.ACTIVE) {
          throw new BadRequestException(
            this.i18n.translate('product.not_available', {
              lang,
              args: { name: product.name },
            }),
          );
        }

        const itemSubtotal = Number(product.price) * item.quantity;
        subtotal += itemSubtotal;

        orderItems.push({
          productId: product.id,
          productName: product.name,
          price: Number(product.price),
          quantity: item.quantity,
          subtotal: itemSubtotal,
        });
      }

      // 4. Calculate shipping
      const shippingFee = SHIPPING_FEE;
      let shippingDiscount = 0;

      // 5. Apply vouchers
      let productDiscount = 0; // Discount on products
      const voucherCodes = dto.voucherCodes || [];

      // Create order first to get orderId
      const orderNumber = this.generateOrderNumber();

      // Set expiry for VIETQR and BANK_TRANSFER only
      let expiresAt: Date | null = null;
      if (
        dto.paymentMethod === 'VIETQR' ||
        dto.paymentMethod === 'BANK_TRANSFER'
      ) {
        expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + this.orderExpiryMinutes);
      }

      const order = await tx.order.create({
        data: {
          orderNumber,
          userId,
          addressId: dto.addressId || null,
          addressText: finalAddressText,
          subtotal: subtotal,
          discountAmount: 0, // Will update after applying vouchers
          shippingFee: shippingFee,
          shippingDiscount: 0, // Will update if FREE_SHIPPING voucher
          totalAmount: subtotal + shippingFee,
          status: OrderStatus.PENDING,
          paymentMethod: dto.paymentMethod,
          vouchersApplied: voucherCodes,
          customerNote: dto.customerNote,
          expiresAt,
        },
      });

      // Apply each voucher
      for (const code of voucherCodes) {
        const voucherResult = await this.voucherInstancesService.applyVoucher(
          code,
          subtotal,
          userId,
          order.id,
          tx,
          lang,
        );

        // Check if FREE_SHIPPING voucher
        if (
          voucherResult.voucher.template.discountType ===
          DiscountType.FREE_SHIPPING
        ) {
          // Apply to shipping fee
          const maxShippingDiscount = Math.min(
            Number(voucherResult.voucher.template.discountValue),
            shippingFee - shippingDiscount,
          );
          shippingDiscount += maxShippingDiscount;
        } else {
          // Regular discount on products
          productDiscount += voucherResult.discount;
        }
      }

      // 6. Calculate final totals
      const finalShippingFee = Math.max(0, shippingFee - shippingDiscount);
      const totalAmount = subtotal - productDiscount + finalShippingFee;

      // Update order with final amounts
      await tx.order.update({
        where: { id: order.id },
        data: {
          discountAmount: productDiscount,
          shippingDiscount: shippingDiscount,
          totalAmount: totalAmount,
        },
      });

      // 7. Create order items
      await tx.orderItem.createMany({
        data: orderItems.map((item) => ({
          ...item,
          orderId: order.id,
        })),
      });

      // 8. Update product stock
      for (const item of cart.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      // 9. Clear cart
      await tx.cartItem.deleteMany({
        where: { cartId: cart.id },
      });

      // Get full order with relations
      const fullOrder = await tx.order.findUnique({
        where: { id: order.id },
        include: {
          items: {
            include: {
              product: true,
            },
          },
          address: true,
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              language: true,
            },
          },
        },
      });

      return fullOrder;
    });
  }

  async getUserOrders(userId: string, query: QueryOrdersDto) {
    const {
      page = 1,
      limit = PAGINATION.DEFAULT_PAGE_SIZE,
      status,
      sortBy = FIELDS.DEFAULT_SORT_FIELD,
      sortOrder = 'desc',
    } = query;

    const where: any = { userId };

    if (status) {
      where.status = status;
    }

    const skip = calculateSkip(page, limit);

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          items: {
            include: {
              product: true,
            },
          },
          address: true,
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return buildPaginatedResult(orders, total, { page, limit });
  }

  async getAllOrders(query: QueryOrdersDto) {
    const {
      page = 1,
      limit = PAGINATION.DEFAULT_PAGE_SIZE,
      status,
      sortBy = FIELDS.DEFAULT_SORT_FIELD,
      sortOrder = 'desc',
    } = query;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    const skip = calculateSkip(page, limit);

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          items: {
            include: {
              product: true,
            },
          },
          address: true,
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return buildPaginatedResult(orders, total, { page, limit });
  }

  async getOrderById(orderId: string, userId?: string, lang = 'en') {
    const where: any = { id: orderId };
    if (userId) {
      where.userId = userId;
    }

    const order = await this.prisma.order.findFirst({
      where,
      include: {
        items: {
          include: {
            product: true,
          },
        },
        address: true,
        payment: true,
        voucherUsages: {
          include: {
            voucherInstance: {
              include: {
                template: true,
              },
            },
          },
        },
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

    if (!order) {
      throw new NotFoundException(
        this.i18n.translate('order.not_found', { lang }),
      );
    }

    return order;
  }

  async cancelOrder(orderId: string, userId: string, lang = 'en') {
    return await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: {
          id: orderId,
          userId,
        },
        include: {
          items: true,
          voucherUsages: {
            include: {
              voucherInstance: true,
            },
          },
        },
      });

      if (!order) {
        throw new NotFoundException(
          this.i18n.translate('order.not_found', { lang }),
        );
      }

      if (order.status !== OrderStatus.PENDING) {
        throw new BadRequestException(
          this.i18n.translate('order.cannot_cancel', { lang }),
        );
      }

      // Restore product stock
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }

      // Restore voucher instance usage
      for (const usage of order.voucherUsages) {
        const instance = usage.voucherInstance;

        await tx.voucherInstance.update({
          where: { id: instance.id },
          data: {
            usedCount: { decrement: 1 },
            status: instance.usedCount - 1 === 0 ? 'ACTIVE' : instance.status,
          },
        });
      }

      // Update order status
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED,
          cancelledAt: new Date(),
        },
        include: {
          items: {
            include: {
              product: true,
            },
          },
          address: true,
        },
      });

      return updatedOrder;
    });
  }

  async updateOrderStatus(
    orderId: string,
    dto: UpdateOrderStatusDto,
    lang = 'en',
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: true,
      },
    });

    if (!order) {
      throw new NotFoundException(
        this.i18n.translate('order.not_found', { lang }),
      );
    }

    const updateData: any = {
      status: dto.status,
    };

    if (dto.adminNote) {
      updateData.adminNote = dto.adminNote;
    }

    if (dto.status === OrderStatus.CONFIRMED && !order.confirmedAt) {
      updateData.confirmedAt = new Date();
    } else if (dto.status === OrderStatus.SHIPPING && !order.shippedAt) {
      updateData.shippedAt = new Date();
    } else if (dto.status === OrderStatus.DELIVERED && !order.deliveredAt) {
      updateData.deliveredAt = new Date();
    } else if (dto.status === OrderStatus.CANCELLED && !order.cancelledAt) {
      updateData.cancelledAt = new Date();
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: updateData,
      include: {
        items: {
          include: {
            product: true,
          },
        },
        address: true,
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

    return updatedOrder;
  }

  async queueOrderConfirmationEmail(order: any) {
    await this.emailQueue.add('send-order-confirmation', {
      email: order.user.email,
      orderNumber: order.orderNumber,
      totalAmount: Number(order.totalAmount),
      language: order.user.language,
    });
  }
}
