import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { PrismaService } from '@database/prisma.service';
import { StockReservationService } from '@shared/redis/stock-reservation.service';
import { RedisService } from '@shared/redis/redis.service';
import { OrderStatus, PaymentStatus } from '@generated/prisma/client';
import { ConfigService } from '@nestjs/config';

export interface OrderExpiryJob {
  orderId: string;
}

@Processor('order-expiry')
export class OrderExpiryProcessor {
  private readonly logger = new Logger(OrderExpiryProcessor.name);
  private readonly maxConcurrentPayments: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stockReservation: StockReservationService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    this.maxConcurrentPayments = this.config.get('PAYMENT_CONCURRENCY', 1);
  }

  @Process('expire-order')
  async handleOrderExpiry(job: Job<OrderExpiryJob>) {
    const { orderId } = job.data;
    this.logger.log(`Processing order expiry for ${orderId}`);

    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
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

      if (!order) {
        this.logger.warn(`Order ${orderId} not found, skipping expiry`);
        return { skipped: true, reason: 'Order not found' };
      }

      if (order.status !== OrderStatus.PENDING) {
        this.logger.log(
          `Order ${orderId} status is ${order.status}, skipping expiry`,
        );
        return { skipped: true, reason: `Status is ${order.status}` };
      }

      const isPaymentActive = await this.redis.isPaymentSessionActive(orderId);
      if (isPaymentActive) {
        this.logger.log(
          `Order ${orderId} has active payment session, skipping expiry`,
        );
        return { skipped: true, reason: 'Active payment session' };
      }

      await this.prisma.$transaction(async (tx) => {
        await this.stockReservation.releaseReservation(orderId);

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

        await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.EXPIRED },
        });

        if (order.payment && order.payment.status === PaymentStatus.PENDING) {
          await tx.payment.update({
            where: { id: order.payment.id },
            data: {
              status: PaymentStatus.FAILED,
              metadata: {
                ...((order.payment.metadata as any) || {}),
                failedReason: 'Order expired',
                expiredAt: new Date().toISOString(),
              },
            },
          });
        }
      });

      await this.redis.removeFromWaitingQueue(orderId);
      await this.redis.cancelPaymentSession(
        orderId,
        this.maxConcurrentPayments,
      );

      this.logger.log(
        `Order ${orderId} expired and resources released successfully`,
      );

      return { success: true, orderId };
    } catch (error) {
      this.logger.error(
        `Failed to expire order ${orderId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
