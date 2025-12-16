import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma.service';
import { StockReservationService } from '@shared/redis/stock-reservation.service';
import { VoucherClaimService } from '@modules/voucher-instances/voucher-claim.service';
import { PaymentIdempotencyService } from '@modules/payments/payment-idempotency.service';
import { RedisService } from '@shared/redis/redis.service';
import { NotificationsGateway } from '@modules/notifications/notifications.gateway';
import { OrderStatus, PaymentStatus } from '@generated/prisma/client';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);
  private readonly maxConcurrentPayments: number;
  private readonly orderExpiryMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stockReservation: StockReservationService,
    private readonly voucherClaim: VoucherClaimService,
    private readonly paymentIdempotency: PaymentIdempotencyService,
    private readonly redis: RedisService,
    private readonly notifications: NotificationsGateway,
    private readonly config: ConfigService,
  ) {
    this.maxConcurrentPayments = this.config.get('PAYMENT_CONCURRENCY', 1);
    this.orderExpiryMinutes = this.config.get('ORDER_EXPIRY_MINUTES', 15);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async cleanupExpiredStockReservations() {
    try {
      const cleaned = await this.stockReservation.cleanupExpiredReservations();

      if (cleaned > 0) {
        this.logger.log(`Cleaned up ${cleaned} expired stock reservations`);
      }
    } catch (error) {
      this.logger.error('Failed to cleanup stock reservations:', error);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async cleanupExpiredPaymentSessions() {
    try {
      const expiredOrders = await this.redis.cleanupExpiredSessions();

      for (const orderId of expiredOrders) {
        this.logger.log(
          `Processing expired payment session for order ${orderId}`,
        );

        const payment = await this.prisma.payment.findUnique({
          where: { orderId },
          include: { order: true },
        });

        if (payment && payment.status === PaymentStatus.PENDING) {
          await this.prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: PaymentStatus.FAILED,
              metadata: {
                ...((payment.metadata as any) || {}),
                failedReason: 'Session expired',
                expiredAt: new Date().toISOString(),
              },
            },
          });

          this.logger.log(
            `Marked payment ${payment.id} as FAILED due to expiration`,
          );
        }

        // Process next in queue
        const result = await this.redis.completePaymentSession(
          orderId,
          this.maxConcurrentPayments,
        );

        if (result.hasNext && result.nextOrderId) {
          const nextOrder = await this.prisma.order.findUnique({
            where: { id: result.nextOrderId },
          });

          if (nextOrder) {
            this.logger.log(
              `Notifying next user for order ${result.nextOrderId}`,
            );
            await this.notifications.notifyYourTurn(nextOrder.userId, {
              orderId: result.nextOrderId,
            });
          }
        }
      }

      if (expiredOrders.length > 0) {
        this.logger.log(
          `Cleaned up ${expiredOrders.length} expired payment sessions`,
        );
      }
    } catch (error) {
      this.logger.error('Failed to cleanup expired payment sessions:', error);
    }
  }

  @Cron('*/10 * * * *')
  async syncRedisStockWithDB() {
    this.logger.log('Starting Redis-DB stock sync...');

    try {
      const products = await this.prisma.product.findMany({
        select: { id: true, stock: true },
      });

      for (const product of products) {
        const reservedResult = await this.prisma.orderItem.aggregate({
          where: {
            productId: product.id,
            order: { status: { in: ['PENDING', 'PROCESSING'] } },
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
      }
    } catch (error) {
      this.logger.error('Failed to sync Redis stock:', error);
    }
  }

  @Cron('*/15 * * * *')
  async syncVoucherCountersWithDB() {
    this.logger.log('Starting voucher counter sync...');

    try {
      const templates = await this.prisma.voucherTemplate.findMany({
        where: {
          isActive: true,
        },
        include: {
          event: true,
        },
      });

      for (const template of templates) {
        await this.voucherClaim.syncCountersFromDB(
          template.id,
          template.eventId,
          template.issuedCount,
          template.maxIssue,
          template.event.issuedCount,
          template.event.maxVouchers,
        );
      }

      this.logger.log(`Synced ${templates.length} voucher templates`);
    } catch (error) {
      this.logger.error('Failed to sync voucher counters:', error);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async detectInconsistencies() {
    this.logger.log('Checking for Redis-DB inconsistencies...');

    try {
      const products = await this.prisma.product.findMany({
        select: { id: true, stock: true },
      });

      let stockInconsistencies = 0;

      for (const product of products) {
        const redisStock = await this.stockReservation.getStockStatus(
          product.id,
        );
        const dbTotal = product.stock;
        const redisTotal =
          redisStock.available + redisStock.reserved + redisStock.sold;
        const diff = Math.abs(dbTotal - redisTotal);

        if (diff > 0) {
          this.logger.warn(
            `Stock inconsistency for ${product.id}: DB=${dbTotal}, Redis=${redisTotal}, diff=${diff}`,
          );
          stockInconsistencies++;

          const reservedResult = await this.prisma.orderItem.aggregate({
            where: {
              productId: product.id,
              order: { status: { in: ['PENDING', 'PROCESSING'] } },
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
        }
      }

      // Check voucher inconsistencies
      const templates = await this.prisma.voucherTemplate.findMany({
        where: { isActive: true },
        include: { event: true },
      });

      let voucherInconsistencies = 0;

      for (const template of templates) {
        const redisCounters = await this.voucherClaim.getCounters(
          template.id,
          template.eventId,
        );

        const dbTemplateRemaining = template.maxIssue - template.issuedCount;
        const dbEventRemaining =
          template.event.maxVouchers - template.event.issuedCount;

        const templateDiff = Math.abs(
          dbTemplateRemaining - redisCounters.templateRemaining,
        );
        const eventDiff = Math.abs(
          dbEventRemaining - redisCounters.eventRemaining,
        );

        if (templateDiff > 0 || eventDiff > 0) {
          this.logger.warn(
            `Voucher inconsistency for ${template.id}: Template diff=${templateDiff}, Event diff=${eventDiff}`,
          );
          voucherInconsistencies++;

          await this.voucherClaim.syncCountersFromDB(
            template.id,
            template.eventId,
            template.issuedCount,
            template.maxIssue,
            template.event.issuedCount,
            template.event.maxVouchers,
          );
        }
      }

      this.logger.log(
        `Inconsistency check: ${stockInconsistencies} stock, ${voucherInconsistencies} voucher issues fixed`,
      );
    } catch (error) {
      this.logger.error('Failed to detect inconsistencies:', error);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupIdempotencyKeys() {
    try {
      const cleaned = await this.paymentIdempotency.cleanup();
      this.logger.log(`Cleaned up ${cleaned} old idempotency keys`);
    } catch (error) {
      this.logger.error('Failed to cleanup idempotency keys:', error);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpiredRefreshTokens() {
    this.logger.log('Starting cleanup of expired refresh tokens...');

    try {
      const result = await this.prisma.refreshToken.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      this.logger.log(`Cleaned up ${result.count} expired refresh tokens`);
    } catch (error) {
      this.logger.error('Failed to cleanup refresh tokens:', error);
    }
  }

  @Cron(CronExpression.EVERY_6_HOURS)
  async cleanupExpiredPasswordResetTokens() {
    this.logger.log('Starting cleanup of expired password reset tokens...');

    try {
      const result = await this.prisma.user.updateMany({
        where: {
          resetPasswordExpiry: { lt: new Date() },
          resetPasswordToken: { not: null },
        },
        data: {
          resetPasswordToken: null,
          resetPasswordExpiry: null,
        },
      });

      this.logger.log(
        `Cleaned up ${result.count} expired password reset tokens`,
      );
    } catch (error) {
      this.logger.error('Failed to cleanup password reset tokens:', error);
    }
  }

  @Cron(CronExpression.EVERY_6_HOURS)
  async cleanupExpiredEmailVerificationTokens() {
    this.logger.log('Starting cleanup of expired email verification tokens...');

    try {
      const result = await this.prisma.user.updateMany({
        where: {
          emailVerifyExpiry: { lt: new Date() },
          emailVerifyToken: { not: null },
        },
        data: {
          emailVerifyToken: null,
          emailVerifyExpiry: null,
        },
      });

      this.logger.log(
        `Cleaned up ${result.count} expired email verification tokens`,
      );
    } catch (error) {
      this.logger.error('Failed to cleanup email verification tokens:', error);
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async cleanupExpiredEditLocks() {
    this.logger.log('Starting cleanup of expired edit locks...');

    try {
      const result = await this.prisma.editLock.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      this.logger.log(`Cleaned up ${result.count} expired edit locks`);
    } catch (error) {
      this.logger.error('Failed to cleanup edit locks:', error);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async markExpiredVoucherInstances() {
    this.logger.log('Starting marking expired voucher instances...');

    try {
      const result = await this.prisma.voucherInstance.updateMany({
        where: {
          status: 'ACTIVE',
          expiresAt: {
            lt: new Date(),
          },
        },
        data: {
          status: 'EXPIRED',
        },
      });

      this.logger.log(`Marked ${result.count} voucher instances as expired`);
    } catch (error) {
      this.logger.error('Failed to mark expired voucher instances:', error);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async databaseHealthCheck() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      this.logger.error('Database health check failed:', error);
    }
  }
}
