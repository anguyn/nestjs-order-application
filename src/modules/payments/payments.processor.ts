import {
  Processor,
  Process,
  OnQueueFailed,
  OnQueueCompleted,
} from '@nestjs/bull';
import type { Job } from 'bull';
import { Inject } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notifications: NotificationsGateway,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  @Process({ name: 'process-payment', concurrency: 5 })
  async handlePayment(job: Job<PaymentJob>) {
    const { paymentId, orderId, amount } = job.data;

    this.logger.info('Processing payment job', {
      service: 'job',
      queue: 'payment-processing',
      jobId: job.id,
      paymentId,
      orderId,
      amount,
      attempt: job.attemptsMade + 1,
    });

    try {
      const payment = await this.prisma.payment.findUnique({
        where: { id: paymentId },
        include: { order: { include: { user: true } } },
      });

      if (!payment) {
        throw new Error('Payment not found');
      }

      if (payment.status === PaymentStatus.COMPLETED) {
        this.logger.warn('Payment already completed', {
          service: 'job',
          paymentId,
          status: payment.status,
        });
        return { success: true, message: 'Already completed' };
      }

      await this.prisma.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.PROCESSING },
      });

      await this.notifications.notifyPaymentProcessing(
        payment.order.userId,
        payment.order,
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));

      await this.prisma.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.PENDING },
      });

      this.logger.info('Payment job completed', {
        service: 'job',
        jobId: job.id,
        paymentId,
        status: 'waiting_for_webhook',
      });

      return { success: true, message: 'Payment ready for confirmation' };
    } catch (error) {
      this.logger.error('Payment job failed', {
        service: 'job',
        jobId: job.id,
        paymentId,
        orderId,
        attempt: job.attemptsMade + 1,
        error: error.message,
        stack: error.stack,
      });

      try {
        await this.prisma.payment.update({
          where: { id: paymentId },
          data: {
            status: PaymentStatus.FAILED,
            metadata: {
              error: error.message,
              failedAt: new Date().toISOString(),
              jobId: job.id,
            },
          },
        });
      } catch (updateError) {
        this.logger.error('Failed to update payment status', {
          service: 'job',
          paymentId,
          error: updateError.message,
        });
      }

      await this.redis.removeFromPaymentQueue(orderId);

      throw error;
    }
  }

  @OnQueueCompleted()
  onCompleted(job: Job<PaymentJob>) {
    this.logger.info('Payment job completed successfully', {
      service: 'job',
      queue: 'payment-processing',
      jobId: job.id,
      paymentId: job.data.paymentId,
      orderId: job.data.orderId,
      attempts: job.attemptsMade,
      duration:
        job.finishedOn && job.processedOn
          ? job.finishedOn - job.processedOn
          : null,
    });
  }

  @OnQueueFailed()
  onFailed(job: Job<PaymentJob>, error: Error) {
    this.logger.error('Payment job failed after all retries', {
      service: 'job',
      queue: 'payment-processing',
      jobId: job.id,
      paymentId: job.data.paymentId,
      orderId: job.data.orderId,
      amount: job.data.amount,
      attempts: job.attemptsMade,
      maxAttempts: job.opts.attempts,
      error: error.message,
      stack: error.stack,
      failedReason: job.failedReason,
    });
  }
}
