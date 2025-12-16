import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger as WTLogger } from 'winston';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '@database/prisma.service';
import { RedisService } from '@shared/redis/redis.service';
import { StockReservationService } from '@shared/redis/stock-reservation.service';
import { PaymentIdempotencyService } from './payment-idempotency.service';
import { NotificationsGateway } from '@modules/notifications/notifications.gateway';
import { PaymentStatus, PaymentMethod } from '@generated/prisma/client';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';
import { OrdersService } from '@modules/orders/orders.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly maxConcurrentPayments: number;
  private readonly orderExpiryMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly stockReservation: StockReservationService,
    private readonly paymentIdempotency: PaymentIdempotencyService,
    private readonly ordersService: OrdersService,
    private readonly notifications: NotificationsGateway,
    private readonly i18n: I18nService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly wtLogger: WTLogger,
    @InjectQueue('order-expiry') private readonly orderExpiryQueue: Queue,
  ) {
    this.maxConcurrentPayments = this.config.get('PAYMENT_CONCURRENCY', 1);
    this.orderExpiryMinutes = this.config.get('ORDER_EXPIRY_MINUTES', 15);
  }

  async initiatePayment(orderId: string, userId: string, lang = 'en') {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true },
    });

    if (!order) {
      throw new NotFoundException(
        this.i18n.translate('payment.order_not_found', { lang }),
      );
    }

    if (order.userId !== userId) {
      throw new BadRequestException(
        this.i18n.translate('payment.not_your_order', { lang }),
      );
    }

    if (order.status !== 'PENDING') {
      throw new BadRequestException(
        this.i18n.translate('payment.order_already_processed', { lang }),
      );
    }

    if (order.paymentMethod === PaymentMethod.CASH) {
      throw new BadRequestException(
        this.i18n.translate('payment.cash_no_payment_creation', { lang }),
      );
    }

    const queueResult = await this.redis.tryStartPaymentSession(
      orderId,
      userId,
      this.maxConcurrentPayments,
    );

    if (queueResult.canStart) {
      const newExpiry = new Date();
      newExpiry.setMinutes(newExpiry.getMinutes() + this.orderExpiryMinutes);

      await this.prisma.order.update({
        where: { id: orderId },
        data: { expiresAt: newExpiry },
      });

      this.logger.log(
        `Order ${orderId} expiry extended to ${newExpiry.toISOString()}`,
      );

      this.wtLogger.info('Order expiry extended', {
        service: 'payment',
        orderId,
        oldExpiry: order.expiresAt?.toISOString(),
        newExpiry: newExpiry.toISOString(),
      });

      try {
        await this.orderExpiryQueue.removeJobs(`expire-${orderId}`);
        this.wtLogger.info('Cancelled old expiry job', {
          service: 'payment',
          orderId,
        });
      } catch (error) {
        this.wtLogger.warn('Failed to remove old expiry job', {
          service: 'payment',
          orderId,
          error: error.message,
        });
      }

      const delay = newExpiry.getTime() - Date.now();
      if (delay > 0) {
        await this.orderExpiryQueue.add(
          'expire-order',
          { orderId },
          {
            delay,
            jobId: `expire-${orderId}`,
            removeOnComplete: true,
          },
        );

        this.wtLogger.info('Rescheduled expiry job', {
          service: 'payment',
          orderId,
          delayMs: delay,
          willExpireAt: newExpiry.toISOString(),
        });
      }

      let payment = await this.prisma.payment.findUnique({
        where: { orderId },
      });

      if (!payment) {
        payment = await this.prisma.payment.create({
          data: {
            orderId,
            amount: order.totalAmount,
            method: order.paymentMethod,
            status: PaymentStatus.PENDING,
            metadata: {},
          },
        });
        this.logger.log(
          `Created new payment ${payment.id} for order ${orderId}`,
        );
      } else if (payment.status === PaymentStatus.FAILED) {
        payment = await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.PENDING,
            paidAt: null,
            metadata: {
              ...((payment.metadata as any) || {}),
              retryAt: new Date().toISOString(),
            },
          },
        });
        this.logger.log(`Reset payment ${payment.id} for retry`);
      }

      this.logger.log(`Payment session started for order ${orderId}`);

      return {
        canPay: true,
        payment,
        queuePosition: null,
      };
    } else {
      this.logger.log(
        `Order ${orderId} waiting at position ${queueResult.position}`,
      );

      if (queueResult.position) {
        await this.notifications.notifyQueueUpdate(userId, {
          orderId,
          position: queueResult.position,
          status: 'WAITING',
        });
      }

      const existingPayment = await this.prisma.payment.findUnique({
        where: { orderId },
      });

      return {
        canPay: false,
        payment: existingPayment || null,
        queuePosition: queueResult.position,
      };
    }
  }

  /**
   * Generate QR code for active payment session
   */
  async generateQRCode(orderId: string, userId: string, lang = 'en') {
    const isActive = await this.redis.isPaymentSessionActive(orderId);

    if (!isActive) {
      throw new BadRequestException(
        this.i18n.translate('payment.session_not_active', { lang }),
      );
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order || order.userId !== userId) {
      throw new NotFoundException(
        this.i18n.translate('payment.order_not_found', { lang }),
      );
    }

    const payment = await this.prisma.payment.findUnique({
      where: { orderId },
    });

    if (!payment) {
      throw new NotFoundException(
        this.i18n.translate('payment.not_found', { lang }),
      );
    }

    const session = await this.redis.getPaymentSession(orderId);

    if (!session) {
      throw new BadRequestException(
        this.i18n.translate('payment.session_not_found', { lang }),
      );
    }

    const accountNo = this.config.get('PAYMENT_ACCOUNT_NUMBER');
    const accountName = this.config.get('PAYMENT_ACCOUNT_NAME');
    const bankCode = this.config.get('PAYMENT_BANK_ID');
    const amount = order.totalAmount;
    const content = `${order.orderNumber}`;

    const qrUrl = `https://img.vietqr.io/image/${bankCode}-${accountNo}-compact2.jpg?amount=${amount}&addInfo=${encodeURIComponent(content)}&accountName=${encodeURIComponent(accountName)}`;

    const qrBase64 = await QRCode.toDataURL(qrUrl);

    return {
      qrUrl,
      qrBase64,
      bankCode,
      accountNo,
      accountName,
      amount,
      content,
      orderNumber: order.orderNumber,
      remainingSeconds: session.remainingSeconds,
    };
  }

  /**
   * Get payment status and queue info
   */
  async getPaymentStatus(orderId: string, userId: string, lang = 'en') {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order || order.userId !== userId) {
      throw new NotFoundException(
        this.i18n.translate('payment.order_not_found', { lang }),
      );
    }

    const payment = await this.prisma.payment.findUnique({
      where: { orderId },
    });

    const queueInfo = await this.redis.getWaitingPosition(orderId);
    const session = await this.redis.getPaymentSession(orderId);

    return {
      payment,
      queue: {
        status: queueInfo.status, // 'ACTIVE' | 'WAITING' | 'NOT_FOUND'
        position: queueInfo.position,
        total: queueInfo.total,
      },
      session: session
        ? {
            userId: session.userId,
            remainingSeconds: session.remainingSeconds,
            startedAt: session.startedAt,
            startedAtUnix: session.startedAtUnix,
            expiresAtUnix: session.expiresAtUnix,
          }
        : null,
    };
  }

  async handleWebhook(body: any, signature: string) {
    const requestId = `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.logger.log('Webhook received');

    this.wtLogger.info('Webhook received', {
      service: 'webhook',
      requestId,
      body,
      signature,
      receivedAt: new Date().toISOString(),
    });

    const isValid = this.verifySignature(body, signature);

    if (!isValid) {
      this.logger.error('Invalid webhook signature');

      this.wtLogger.error('Invalid webhook signature', {
        service: 'webhook',
        requestId,
        signature,
      });

      throw new BadRequestException('Invalid signature');
    }

    const { transferAmount, content, when, transactionId } = body;

    const orderId = this.extractOrderId(content);
    if (!orderId) {
      this.logger.warn('Cannot extract order ID from content:', content);
      this.wtLogger.warn('Cannot extract order ID from content', {
        service: 'webhook',
        requestId,
        content,
      });
      return { success: false, message: 'Invalid content' };
    }

    const shouldProcess = await this.paymentIdempotency.checkAndMarkProcessed(
      orderId,
      transactionId || `${Date.now()}`,
    );

    if (!shouldProcess) {
      this.logger.warn(
        `Duplicate webhook detected for order ${orderId}, transaction ${transactionId}`,
      );

      this.wtLogger.warn('Duplicate webhook detected', {
        service: 'webhook',
        requestId,
        orderId,
        transactionId,
        action: 'skipped',
      });

      return { success: true, message: 'Already processed' };
    }

    const orderNumber = this.extractOrderNumber(content);
    if (!orderNumber) {
      this.logger.warn('Cannot extract order number from content:', content);
      this.wtLogger.warn('Cannot extract order number', {
        service: 'webhook',
        requestId,
        content,
      });

      await this.paymentIdempotency.markAsFailed(
        orderId,
        transactionId || `${Date.now()}`,
        'Invalid content',
      );
      return { success: false, message: 'Invalid content' };
    }

    const order = await this.prisma.order.findFirst({
      where: { orderNumber },
      include: { payment: true, user: true, items: true },
    });

    if (!order) {
      this.logger.warn('Order not found:', orderNumber);
      this.wtLogger.warn('Order not found', {
        service: 'webhook',
        requestId,
        orderNumber,
      });

      await this.paymentIdempotency.markAsFailed(
        orderId,
        transactionId || `${Date.now()}`,
        'Order not found',
      );
      return { success: false, message: 'Order not found' };
    }

    if (!order.payment) {
      this.logger.warn('Payment not found for order:', orderNumber);
      this.wtLogger.warn('Payment not found for order', {
        service: 'webhook',
        requestId,
        orderNumber,
      });
      await this.paymentIdempotency.markAsFailed(
        order.id,
        transactionId || `${Date.now()}`,
        'Payment not found',
      );
      return { success: false, message: 'Payment not found' };
    }

    if (Number(transferAmount) !== Number(order.totalAmount)) {
      this.logger.warn('Amount mismatch:', {
        expected: order.totalAmount,
        received: transferAmount,
      });
      this.wtLogger.error('Amount mismatch detected', {
        service: 'webhook',
        requestId,
        orderNumber,
        expected: Number(order.totalAmount),
        received: Number(transferAmount),
        difference: Number(transferAmount) - Number(order.totalAmount),
      });

      await this.paymentIdempotency.markAsFailed(
        order.id,
        transactionId || `${Date.now()}`,
        'Amount mismatch',
      );

      await this.prisma.paymentDispute.create({
        data: {
          orderId: order.id,
          expectedAmount: order.totalAmount,
          receivedAmount: transferAmount,
          transactionId,
          content,
          reason: 'AMOUNT_MISMATCH',
          webhookBody: body,
          status: 'PENDING',
        },
      });

      await this.notifications.sendToAll('admin:payment-dispute', {
        type: 'AMOUNT_MISMATCH',
        orderId: order.id,
        orderNumber: order.orderNumber,
        expected: Number(order.totalAmount),
        received: Number(transferAmount),
      });

      return { success: false, message: 'Amount mismatch - dispute created' };
    }

    try {
      await this.ordersService.confirmOrderStock(order.id);

      await this.prisma.$transaction([
        this.prisma.payment.update({
          where: { id: order.payment.id },
          data: {
            status: PaymentStatus.COMPLETED,
            paidAt: new Date(when),
            metadata: {
              ...((order.payment.metadata as any) || {}),
              webhookReceivedAt: new Date().toISOString(),
              content,
              transactionId,
              requestId,
            },
          },
        }),
        this.prisma.order.update({
          where: { id: order.id },
          data: {
            status: 'PAID',
            paidAt: new Date(when),
          },
        }),
      ]);

      const result = await this.redis.completePaymentSession(
        order.id,
        this.maxConcurrentPayments,
      );

      await this.orderExpiryQueue
        .removeJobs(`expire-${order.id}`)
        .catch(() => {});

      await this.notifications.notifyPaymentConfirmed(order.userId, {
        orderId: order.id,
        amount: transferAmount,
        order: order,
      });

      if (result.hasNext && result.nextOrderId) {
        const nextOrder = await this.prisma.order.findUnique({
          where: { id: result.nextOrderId },
        });

        if (nextOrder) {
          await this.notifications.notifyYourTurn(nextOrder.userId, {
            orderId: result.nextOrderId,
          });
        }
      }

      this.logger.log(`Payment confirmed for order ${orderNumber}`);

      this.wtLogger.info('Webhook processed successfully', {
        service: 'webhook',
        requestId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: transferAmount,
        transactionId,
      });

      return { success: true, message: 'Payment confirmed' };
    } catch (error) {
      this.logger.error('Error processing webhook:', error);
      this.wtLogger.error('Error processing webhook', {
        service: 'webhook',
        requestId,
        orderId: order.id,
        error: error.message,
        stack: error.stack,
      });
      await this.paymentIdempotency.markAsFailed(
        order.id,
        transactionId || `${Date.now()}`,
        'Error processing webhook',
      );
      throw error;
    }
  }

  /**
   * Cancel payment (user or system)
   */
  async cancelPayment(orderId: string, userId: string, lang = 'en') {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order || order.userId !== userId) {
      throw new NotFoundException(
        this.i18n.translate('payment.order_not_found', { lang }),
      );
    }

    await this.stockReservation.releaseReservation(orderId);

    await this.redis.removeFromWaitingQueue(orderId);
    const result = await this.redis.cancelPaymentSession(
      orderId,
      this.maxConcurrentPayments,
    );

    const payment = await this.prisma.payment.findUnique({
      where: { orderId },
    });

    if (payment && payment.status === PaymentStatus.PENDING) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          metadata: {
            ...((payment.metadata as any) || {}),
            cancelledAt: new Date().toISOString(),
            cancelledBy: 'user',
          },
        },
      });
    }

    if (result.hasNext && result.nextOrderId) {
      const nextOrder = await this.prisma.order.findUnique({
        where: { id: result.nextOrderId },
      });

      if (nextOrder) {
        await this.notifications.notifyYourTurn(nextOrder.userId, {
          orderId: result.nextOrderId,
        });
      }
    }

    return { success: true };
  }

  /**
   * Admin: Manually verify payment
   */
  async verifyPayment(paymentId: string, lang = 'en') {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: { include: { user: true } } },
    });

    if (!payment) {
      throw new NotFoundException(
        this.i18n.translate('payment.not_found', { lang }),
      );
    }

    if (payment.status === PaymentStatus.COMPLETED) {
      throw new BadRequestException(
        this.i18n.translate('payment.already_verified', { lang }),
      );
    }

    await this.ordersService.confirmOrderStock(payment.orderId);

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: PaymentStatus.COMPLETED,
          paidAt: new Date(),
          metadata: {
            ...((payment.metadata as any) || {}),
            manualVerification: true,
            verifiedAt: new Date().toISOString(),
          },
        },
      }),
      this.prisma.order.update({
        where: { id: payment.orderId },
        data: {
          status: 'PAID',
          paidAt: new Date(),
        },
      }),
    ]);

    const result = await this.redis.completePaymentSession(
      payment.orderId,
      this.maxConcurrentPayments,
    );

    await this.orderExpiryQueue
      .removeJobs(`expire-${payment.orderId}`)
      .catch(() => {});

    await this.notifications.notifyPaymentConfirmed(payment.order.userId, {
      orderId: payment.orderId,
      amount: payment.amount,
      order: payment.order,
    });

    if (result.hasNext && result.nextOrderId) {
      const nextOrder = await this.prisma.order.findUnique({
        where: { id: result.nextOrderId },
      });

      if (nextOrder) {
        await this.notifications.notifyYourTurn(nextOrder.userId, {
          orderId: result.nextOrderId,
        });
      }
    }

    this.logger.log(`Payment ${paymentId} manually verified`);

    return payment;
  }

  async clearQueue() {
    const stats = await this.redis.clearPaymentQueue();
    this.logger.log(`Cleared payment queue: ${JSON.stringify(stats)}`);
    return stats;
  }

  /**
   * System: Handle expired sessions (called by cron)
   */
  async handleExpiredSessions() {
    const expiredOrders = await this.redis.cleanupExpiredSessions();

    for (const orderId of expiredOrders) {
      try {
        await this.stockReservation.releaseReservation(orderId);

        const payment = await this.prisma.payment.findUnique({
          where: { orderId },
          include: { order: { include: { user: true } } },
        });

        if (payment && payment.status === PaymentStatus.PENDING) {
          await this.prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: PaymentStatus.FAILED,
              metadata: {
                ...((payment.metadata as any) || {}),
                cancelledAt: new Date().toISOString(),
                cancelledBy: 'system',
                reason: 'session_expired',
              },
            },
          });

          await this.notifications.notifySessionExpired(payment.order.userId, {
            orderId,
          });
        }

        const result = await this.redis.completePaymentSession(
          orderId,
          this.maxConcurrentPayments,
        );

        if (result.hasNext && result.nextOrderId) {
          const nextOrder = await this.prisma.order.findUnique({
            where: { id: result.nextOrderId },
          });

          if (nextOrder) {
            await this.notifications.notifyYourTurn(nextOrder.userId, {
              orderId: result.nextOrderId,
            });
          }
        }

        this.logger.log(`Handled expired session for order ${orderId}`);
      } catch (error) {
        this.logger.error(
          `Failed to handle expired session for order ${orderId}:`,
          error,
        );
      }
    }

    return { expiredCount: expiredOrders.length };
  }

  private verifySignature(body: any, signature: string): boolean {
    const secret = this.config.get('SEPAY_SECRET_KEY');
    if (!secret) {
      this.logger.warn('SEPAY_SECRET_KEY not configured');
      this.wtLogger.warn(
        'SEPAY_SECRET_KEY not configured - skipping signature verification',
      );
      return true;
    }
    const data = JSON.stringify(body);
    const hash = crypto.createHmac('sha256', secret).update(data).digest('hex');
    return hash === signature;
  }

  private extractOrderNumber(content: string): string | null {
    const match = content.match(/ORDER-\d{8}-\d{4}/);
    return match ? match[0] : null;
  }

  private extractOrderId(content: string): string | null {
    const orderNumber = this.extractOrderNumber(content);
    if (orderNumber) {
      return orderNumber;
    }
    return content;
  }
}
