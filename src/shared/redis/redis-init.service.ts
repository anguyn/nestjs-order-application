import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';
import { StockReservationService } from '@shared/redis/stock-reservation.service';
import { VoucherClaimService } from '@modules/voucher-instances/voucher-claim.service';

@Injectable()
export class RedisInitService implements OnModuleInit {
  private readonly logger = new Logger(RedisInitService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stockReservation: StockReservationService,
    private readonly voucherClaim: VoucherClaimService,
  ) {}

  async onModuleInit() {
    this.logger.log('🚀 Initializing Redis from database...');

    try {
      await this.initializeStockCounters();

      await this.initializeVoucherCounters();

      this.logger.log('✅ Redis initialization completed successfully');
    } catch (error) {
      this.logger.error('❌ Failed to initialize Redis:', error);
      throw error; // Re-throw to prevent app start if critical
    }
  }

  /**
   * Initialize stock counters for all products
   * Calculates: available, reserved, sold from DB
   */
  private async initializeStockCounters() {
    this.logger.log('📦 Initializing stock counters...');

    const products = await this.prisma.product.findMany({
      select: {
        id: true,
        name: true,
        stock: true,
      },
    });

    let successCount = 0;
    let errorCount = 0;

    for (const product of products) {
      try {
        const reservedResult = await this.prisma.orderItem.aggregate({
          where: {
            productId: product.id,
            order: {
              status: {
                in: ['PENDING', 'PROCESSING'],
              },
            },
          },
          _sum: {
            quantity: true,
          },
        });

        const reserved = reservedResult._sum.quantity || 0;

        const soldResult = await this.prisma.orderItem.aggregate({
          where: {
            productId: product.id,
            order: {
              status: {
                in: ['PAID', 'CONFIRMED', 'SHIPPING', 'DELIVERED'],
              },
            },
          },
          _sum: {
            quantity: true,
          },
        });

        const sold = soldResult._sum.quantity || 0;

        const available = product.stock - (reserved + sold);

        await this.stockReservation.syncStockFromDB(
          product.id,
          available,
          sold,
          reserved,
        );

        this.logger.log(
          `✓ ${product.name}: available=${available}, reserved=${reserved}, sold=${sold}, total=${product.stock}`,
        );

        successCount++;
      } catch (error) {
        this.logger.error(
          `✗ Failed to init stock for product ${product.id}:`,
          error,
        );
        errorCount++;
      }
    }

    this.logger.log(
      `📦 Stock initialization: ${successCount} success, ${errorCount} errors`,
    );
  }

  /**
   * Initialize voucher counters for active templates
   */
  private async initializeVoucherCounters() {
    this.logger.log('🎫 Initializing voucher counters...');

    const templates = await this.prisma.voucherTemplate.findMany({
      where: { isActive: true },
      include: {
        event: true,
      },
    });

    let successCount = 0;
    let errorCount = 0;

    for (const template of templates) {
      try {
        const templateRemaining = template.maxIssue - template.issuedCount;
        const eventRemaining =
          template.event.maxVouchers - template.event.issuedCount;

        await this.voucherClaim.initializeVoucherCounters(
          template.id,
          template.eventId,
          Math.max(0, templateRemaining),
          Math.max(0, eventRemaining),
        );

        this.logger.log(
          `✓ ${template.name}: template=${templateRemaining}, event=${eventRemaining}`,
        );

        successCount++;
      } catch (error) {
        this.logger.error(
          `✗ Failed to init voucher template ${template.id}:`,
          error,
        );
        errorCount++;
      }
    }

    this.logger.log(
      `🎫 Voucher initialization: ${successCount} success, ${errorCount} errors`,
    );
  }

  /**
   * Manual re-sync for specific product (useful for debugging)
   */
  async resyncProduct(productId: string) {
    this.logger.log(`🔄 Re-syncing product ${productId}...`);

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, stock: true },
    });

    if (!product) {
      throw new Error(`Product ${productId} not found`);
    }

    const reservedResult = await this.prisma.orderItem.aggregate({
      where: {
        productId: product.id,
        order: {
          status: { in: ['PENDING', 'PROCESSING'] },
        },
      },
      _sum: { quantity: true },
    });

    const reserved = reservedResult._sum.quantity || 0;

    const soldResult = await this.prisma.orderItem.aggregate({
      where: {
        productId: product.id,
        order: {
          status: { in: ['PAID', 'CONFIRMED', 'SHIPPING', 'DELIVERED'] },
        },
      },
      _sum: { quantity: true },
    });

    const sold = soldResult._sum.quantity || 0;

    const available = product.stock - (reserved + sold);

    await this.stockReservation.syncStockFromDB(
      product.id,
      available,
      sold,
      reserved,
    );

    this.logger.log(
      `✅ Product ${product.name} re-synced: available=${available}, reserved=${reserved}, sold=${sold}`,
    );

    return { productId, available, reserved, sold, total: product.stock };
  }

  /**
   * Manual re-sync for specific voucher template
   */
  async resyncVoucherTemplate(templateId: string) {
    this.logger.log(`🔄 Re-syncing voucher template ${templateId}...`);

    const template = await this.prisma.voucherTemplate.findUnique({
      where: { id: templateId },
      include: { event: true },
    });

    if (!template) {
      throw new Error(`Voucher template ${templateId} not found`);
    }

    const templateRemaining = template.maxIssue - template.issuedCount;
    const eventRemaining =
      template.event.maxVouchers - template.event.issuedCount;

    await this.voucherClaim.initializeVoucherCounters(
      template.id,
      template.eventId,
      Math.max(0, templateRemaining),
      Math.max(0, eventRemaining),
    );

    this.logger.log(
      `✅ Template ${template.name} re-synced: template=${templateRemaining}, event=${eventRemaining}`,
    );

    return {
      templateId,
      templateRemaining,
      eventRemaining,
    };
  }
}
