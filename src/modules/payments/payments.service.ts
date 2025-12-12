import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '@database/prisma.service';
import { RedisService } from '@shared/redis/redis.service';
import { NotificationsGateway } from '@modules/notifications/notifications.gateway';
import { PaymentStatus, PaymentMethod } from '@generated/prisma/client';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly maxConcurrentPayments: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly notifications: NotificationsGateway,
    private readonly i18n: I18nService,
  ) {
    this.maxConcurrentPayments = this.config.get('MAX_CONCURRENT_PAYMENTS', 1);
  }

  /**
   * Initiate payment - join queue or start session
   * CHỈ TẠO PAYMENT KHI ĐẾN LƯỢT (ACTIVE), KHÔNG TẠO KHI ĐANG CHỜ
   */
  async initiatePayment(orderId: string, userId: string, lang = 'en') {
    // Validate order
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

    // Try to start payment session
    const queueResult = await this.redis.tryStartPaymentSession(
      orderId,
      userId,
      this.maxConcurrentPayments,
    );

    if (queueResult.canStart) {
      let payment = await this.prisma.payment.findUnique({
        where: { orderId },
      });

      if (!payment) {
        // Tạo mới payment
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
        // Reset payment cũ để tái sử dụng
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
      // Nếu payment.status === PENDING/PROCESSING/COMPLETED thì giữ nguyên

      this.logger.log(`Payment session started for order ${orderId}`);

      return {
        canPay: true,
        payment,
        queuePosition: null,
      };
    } else {
      // ❌ Phải đợi - KHÔNG TẠO PAYMENT
      this.logger.log(
        `Order ${orderId} waiting at position ${queueResult.position}`,
      );

      // Notify user of queue position
      if (queueResult.position) {
        await this.notifications.notifyQueueUpdate(userId, {
          orderId,
          position: queueResult.position,
          status: 'WAITING',
        });
      }

      // Trả về payment cũ nếu có (để UI biết), nhưng không tạo mới
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
   * CHỈ TẠO QR KHI SESSION ĐANG ACTIVE
   */
  async generateQRCode(orderId: string, userId: string, lang = 'en') {
    // Check if session is active
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

    // Get session data for remaining time
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

    // Check queue status
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

  /**
   * Handle webhook - payment confirmed
   */
  async handleWebhook(body: any, signature: string) {
    const isValid = this.verifySignature(body, signature);
    console.log('Test: ', signature);
    if (!isValid) {
      throw new BadRequestException('Invalid signature');
    }

    const { transferAmount, content, when } = body;

    const orderNumber = this.extractOrderNumber(content);
    if (!orderNumber) {
      this.logger.warn('Cannot extract order number from content:', content);
      return { success: false, message: 'Invalid content' };
    }

    const order = await this.prisma.order.findFirst({
      where: { orderNumber },
      include: { payment: true, user: true },
    });

    if (!order) {
      this.logger.warn('Order not found:', orderNumber);
      return { success: false, message: 'Order not found' };
    }

    if (!order.payment) {
      this.logger.warn('Payment not found for order:', orderNumber);
      return { success: false, message: 'Payment not found' };
    }

    if (Number(transferAmount) !== Number(order.totalAmount)) {
      this.logger.warn('Amount mismatch:', {
        expected: order.totalAmount,
        received: transferAmount,
      });
      return { success: false, message: 'Amount mismatch' };
    }

    // Update payment and order
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

    // Complete payment session and process next in queue
    const result = await this.redis.completePaymentSession(
      order.id,
      this.maxConcurrentPayments,
    );

    // Notify user
    await this.notifications.notifyPaymentConfirmed(order.userId, {
      orderId: order.id,
      amount: transferAmount,
      order: order,
    });

    // If there's next person in queue, notify them
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

    return { success: true, message: 'Payment confirmed' };
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

    // Remove from queue/session
    await this.redis.removeFromWaitingQueue(orderId);
    const result = await this.redis.cancelPaymentSession(
      orderId,
      this.maxConcurrentPayments,
    );

    // Update payment status if exists and pending
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

    // Process next in queue if any
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

    // Complete session and process next
    const result = await this.redis.completePaymentSession(
      payment.orderId,
      this.maxConcurrentPayments,
    );

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
        const payment = await this.prisma.payment.findUnique({
          where: { orderId },
          include: { order: { include: { user: true } } },
        });

        if (payment && payment.status === PaymentStatus.PENDING) {
          // Update payment to cancelled
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

          // Notify user
          await this.notifications.notifySessionExpired(payment.order.userId, {
            orderId,
          });
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
    const data = JSON.stringify(body);
    const hash = crypto.createHmac('sha256', secret).update(data).digest('hex');
    return hash === signature;
  }

  private extractOrderNumber(content: string): string | null {
    const match = content.match(/ORDER-\d{8}-\d{4}/);
    return match ? match[0] : null;
  }
}
