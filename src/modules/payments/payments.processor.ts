import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';
import { RedisService } from '@shared/redis/redis.service';
import { NotificationsGateway } from '@modules/notifications/notifications.gateway';
import { PaymentStatus } from '@generated/prisma/client';

interface PaymentJob {
  paymentId: string;
  orderId: string;
  amount: number;
}

@Processor('payment-processing')
export class PaymentsProcessor {
  private readonly logger = new Logger(PaymentsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notifications: NotificationsGateway,
  ) {}

  @Process({ name: 'process-payment', concurrency: 5 })
  async handlePayment(job: Job<PaymentJob>) {
    const { paymentId, orderId, amount } = job.data;

    this.logger.log(`Processing payment ${paymentId} for order ${orderId}`);

    try {
      // Get payment
      const payment = await this.prisma.payment.findUnique({
        where: { id: paymentId },
        include: { order: { include: { user: true } } },
      });

      if (!payment) {
        throw new Error('Payment not found');
      }

      // Update to processing
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.PROCESSING },
      });

      // Notify user
      await this.notifications.notifyPaymentProcessing(
        payment.order.userId,
        payment.order,
      );

      // Simulate processing time (in real app, this is where you'd call payment gateway)
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // In real app, payment is confirmed via webhook
      // Here we just update status to PENDING (waiting for webhook)
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.PENDING },
      });

      this.logger.log(
        `Payment ${paymentId} ready for confirmation via webhook`,
      );

      return { success: true };
    } catch (error) {
      this.logger.error(`Payment processing failed: ${error.message}`);

      // Update to failed
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: PaymentStatus.FAILED,
          metadata: { error: error.message },
        },
      });

      // Remove from queue
      await this.redis.removeFromPaymentQueue(orderId);

      throw error;
    }
  }
}
