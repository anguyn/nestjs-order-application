import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma.service';
import { RedisService } from '@shared/redis/redis.service';
import { NotificationsGateway } from '@modules/notifications/notifications.gateway';
import { OrderStatus, PaymentStatus } from '@generated/prisma/client';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);
  private readonly maxConcurrentPayments: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notifications: NotificationsGateway,
    private readonly config: ConfigService,
  ) {
    this.maxConcurrentPayments = this.config.get('MAX_CONCURRENT_PAYMENTS', 1);
  }

  /**
   * Cleanup expired payment sessions
   * Runs every minute to ensure timely processing
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async cleanupExpiredPaymentSessions() {
    try {
      // Find expired sessions from Redis
      const expiredOrders = await this.redis.cleanupExpiredSessions();

      for (const orderId of expiredOrders) {
        this.logger.log(
          `Processing expired payment session for order ${orderId}`,
        );

        // Update payment status
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

  /**
   * Cleanup expired orders (15 minutes)
   * Runs every 5 minutes
   */
  @Cron('*/5 * * * *')
  async cleanupExpiredOrders() {
    this.logger.log('Starting cleanup of expired orders...');

    try {
      const expiredOrders = await this.prisma.order.findMany({
        where: {
          status: OrderStatus.PENDING,
          expiresAt: {
            lt: new Date(),
          },
        },
        include: {
          items: true,
          voucherUsages: {
            include: {
              voucherInstance: true,
            },
          },
          payment: true,
        },
      });

      for (const order of expiredOrders) {
        await this.prisma.$transaction(async (tx) => {
          // Restore product stock
          for (const item of order.items) {
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } },
            });
          }

          // Restore voucher instances
          for (const usage of order.voucherUsages) {
            const instance = usage.voucherInstance;

            await tx.voucherInstance.update({
              where: { id: instance.id },
              data: {
                usedCount: { decrement: 1 },
                status:
                  instance.usedCount - 1 === 0 ? 'ACTIVE' : instance.status,
              },
            });
          }

          // Update order status
          await tx.order.update({
            where: { id: order.id },
            data: { status: OrderStatus.EXPIRED },
          });

          // Update payment if exists
          if (order.payment && order.payment.status === PaymentStatus.PENDING) {
            await tx.payment.update({
              where: { id: order.payment.id },
              data: {
                status: PaymentStatus.FAILED,
                metadata: {
                  ...((order.payment.metadata as any) || {}),
                  failedReason: 'Order expired',
                },
              },
            });
          }
        });

        // Remove from payment queue
        await this.redis.removeFromWaitingQueue(order.id);
        await this.redis.cancelPaymentSession(
          order.id,
          this.maxConcurrentPayments,
        );

        this.logger.log(
          `Expired order ${order.orderNumber} and restored stock`,
        );
      }

      this.logger.log(`Processed ${expiredOrders.length} expired orders`);
    } catch (error) {
      this.logger.error('Failed to cleanup expired orders:', error);
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

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupOldEmailLogs() {
    this.logger.log('Starting cleanup of old email logs...');

    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await this.prisma.emailLog.deleteMany({
        where: {
          sentAt: {
            lt: thirtyDaysAgo,
          },
        },
      });

      this.logger.log(`Cleaned up ${result.count} old email logs`);
    } catch (error) {
      this.logger.error('Failed to cleanup email logs:', error);
    }
  }

  @Cron(CronExpression.EVERY_6_HOURS)
  async cleanupExpiredPasswordResetTokens() {
    this.logger.log('Starting cleanup of expired password reset tokens...');

    try {
      const result = await this.prisma.user.updateMany({
        where: {
          resetPasswordExpiry: {
            lt: new Date(),
          },
          resetPasswordToken: {
            not: null,
          },
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
          emailVerifyExpiry: {
            lt: new Date(),
          },
          emailVerifyToken: {
            not: null,
          },
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

  @Cron(CronExpression.EVERY_MINUTE)
  async databaseHealthCheck() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      this.logger.error('Database health check failed:', error);
    }
  }
}
