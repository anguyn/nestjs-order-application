import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@shared/redis/redis.service';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: 'notifications',
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);
  private userSockets: Map<string, Set<string>> = new Map();

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');

    this.startQueueMonitoring();
  }

  async handleConnection(client: Socket) {
    try {
      const cookies = client.handshake.headers.cookie;
      let token: string | undefined;

      if (cookies) {
        const cookieArray = cookies.split(';');
        for (const cookie of cookieArray) {
          const [name, value] = cookie.trim().split('=');
          if (name === 'accessToken') {
            token = value;
            break;
          }
        }
      }

      if (!token) {
        token =
          client.handshake.auth.token ||
          client.handshake.headers.authorization?.replace('Bearer ', '');
      }

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.config.get('JWT_ACCESS_SECRET'),
      });

      const userId = payload.sub;

      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);

      client.join(`user:${userId}`);
      client.data.userId = userId;

      this.logger.log(`User ${userId} connected with socket ${client.id}`);

      client.emit('connected', {
        message: 'Connected to notifications service',
        timestamp: new Date().toISOString(),
        queueStats: await this.getQueueStats(),
      });
    } catch (error) {
      this.logger.error(
        `Connection error for socket ${client.id}:`,
        error.message,
      );
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;

    if (userId) {
      const sockets = this.userSockets.get(userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSockets.delete(userId);
        }
      }
      this.logger.log(`User ${userId} disconnected socket ${client.id}`);
    } else {
      this.logger.log(`Socket ${client.id} disconnected`);
    }
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    return { event: 'pong', data: { timestamp: new Date().toISOString() } };
  }

  @SubscribeMessage('get-queue-position')
  async handleGetQueuePosition(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string },
  ) {
    const position = await this.redis.getQueuePosition(data.orderId);
    return {
      event: 'queue-position',
      data: {
        orderId: data.orderId,
        ...position,
        timestamp: new Date().toISOString(),
      },
    };
  }

  @SubscribeMessage('get-queue-stats')
  async handleGetQueueStats() {
    const stats = await this.getQueueStats();
    return {
      event: 'queue-stats',
      data: stats,
    };
  }

  /**
   * Queue Monitoring - Broadcast queue updates
   */
  private async startQueueMonitoring() {
    setInterval(async () => {
      try {
        const stats = await this.getQueueStats();
        this.server.emit('queue-stats-update', stats);
      } catch (error) {
        this.logger.error('Queue monitoring error:', error);
      }
    }, 5000);
  }

  private async getQueueStats() {
    const queueSize = await this.redis.getQueueSize();
    const maxConcurrent = this.config.get('PAYMENT_CONCURRENCY', 5);

    return {
      current: queueSize,
      max: maxConcurrent,
      available: Math.max(0, maxConcurrent - queueSize),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Send notification to specific user
   */
  sendToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
    this.logger.log(`Sent ${event} to user ${userId}`);
  }

  /**
   * Send notification to all users
   */
  sendToAll(event: string, data: any) {
    this.server.emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
    this.logger.log(`Sent ${event} to all users`);
  }

  /**
   * Queue position update
   */
  async notifyQueuePosition(orderId: string, userId: string) {
    const position = await this.redis.getQueuePosition(orderId);

    this.sendToUser(userId, 'queue:position-updated', {
      type: 'queue_position',
      orderId,
      ...position,
      message:
        position.position === -1
          ? 'Order not in queue'
          : `You are #${position.position} in queue (${position.total} total)`,
    });
  }

  /**
   * Payment processing started
   */
  notifyPaymentProcessing(userId: string, orderData: any) {
    this.sendToUser(userId, 'payment:processing', {
      type: 'payment_processing',
      orderId: orderData.id,
      orderNumber: orderData.orderNumber,
      message: 'Payment is being processed',
    });
  }

  /**
   * Order status update
   */
  notifyOrderStatusUpdate(userId: string, orderData: any) {
    this.sendToUser(userId, 'order:status-updated', {
      type: 'order_status_update',
      orderId: orderData.id,
      orderNumber: orderData.orderNumber,
      status: orderData.status,
      message: `Order ${orderData.orderNumber} status changed to ${orderData.status}`,
    });
  }

  /**
   * Payment confirmed
   */
  notifyPaymentConfirmed(userId: string, paymentData: any) {
    this.sendToUser(userId, 'payment:confirmed', {
      type: 'payment_confirmed',
      orderId: paymentData.orderId,
      orderNumber: paymentData.order?.orderNumber,
      amount: paymentData.amount,
      message: `Payment confirmed for order ${paymentData.order?.orderNumber}`,
    });
  }

  /**
   * Voucher issued
   */
  notifyVoucherIssued(userId: string, voucherData: any) {
    this.sendToUser(userId, 'voucher:issued', {
      type: 'voucher_issued',
      voucherId: voucherData.id,
      code: voucherData.code,
      eventTitle: voucherData.event?.title,
      message: `You received a voucher: ${voucherData.code}`,
    });
  }

  /**
   * Cart updated
   */
  notifyCartUpdated(userId: string, cartData: any) {
    this.sendToUser(userId, 'cart:updated', {
      type: 'cart_updated',
      totalItems: cartData.totalItems,
      subtotal: cartData.subtotal,
      message: 'Your cart has been updated',
    });
  }

  /**
   * Stock low alert (admin)
   */
  notifyStockLow(productData: any) {
    this.sendToAll('product:stock-low', {
      type: 'stock_low',
      productId: productData.id,
      productName: productData.name,
      currentStock: productData.stock,
      message: `Low stock alert: ${productData.name} (${productData.stock} remaining)`,
    });
  }

  /**
   * New order (admin)
   */
  notifyNewOrder(orderData: any) {
    this.sendToAll('order:new', {
      type: 'new_order',
      orderId: orderData.id,
      orderNumber: orderData.orderNumber,
      totalAmount: orderData.totalAmount,
      message: `New order received: ${orderData.orderNumber}`,
    });
  }

  /**
   * Notify user their position in queue changed
   */
  notifyQueueUpdate(
    userId: string,
    data: { orderId: string; position: number; status: string },
  ) {
    this.sendToUser(userId, 'payment:queue-update', {
      type: 'queue_update',
      orderId: data.orderId,
      position: data.position,
      status: data.status,
      message:
        data.status === 'WAITING'
          ? `You are #${data.position} in the payment queue`
          : 'Your payment session is active',
    });
  }

  /**
   * Notify user it's their turn to pay
   */
  notifyYourTurn(userId: string, data: { orderId: string }) {
    this.sendToUser(userId, 'payment:your-turn', {
      type: 'your_turn',
      orderId: data.orderId,
      message: "It's your turn! You can now complete your payment.",
    });
  }

  /**
   * Notify user their payment session expired
   */
  notifySessionExpired(userId: string, data: { orderId: string }) {
    this.sendToUser(userId, 'payment:session-expired', {
      type: 'session_expired',
      orderId: data.orderId,
      message: 'Your payment session has expired. Please try again.',
    });
  }

  /**
   * Broadcast queue stats to all connected users
   */
  async broadcastQueueStats() {
    const stats = await this.redis.getPaymentQueueStats();

    this.sendToAll('payment:queue-stats', {
      type: 'queue_stats',
      ...stats,
    });
  }

  /**
   * Get stats
   */
  getOnlineUsersCount(): number {
    return this.userSockets.size;
  }

  isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId);
  }
}
