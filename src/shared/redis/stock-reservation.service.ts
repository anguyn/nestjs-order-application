import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../constants/global.constant';

export interface ReservationItem {
  productId: string;
  quantity: number;
}

@Injectable()
export class StockReservationService {
  private readonly logger = new Logger(StockReservationService.name);
  private readonly RESERVATION_TTL = 900; // 15 minutes

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  /**
   * Reserve stock for order (atomic operation)
   * Returns: true if successful, false if insufficient stock
   */
  async reserveStock(
    orderId: string,
    items: ReservationItem[],
  ): Promise<{ success: boolean; failedProducts?: string[] }> {
    const multi = this.redis.multi();
    const keys: string[] = [];
    const failedProducts: string[] = [];

    for (const item of items) {
      const availableKey = `stock:${item.productId}:available`;
      keys.push(availableKey);
    }

    const availableStocks = await this.redis.mget(...keys);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const available = parseInt(availableStocks[i] || '0', 10);

      if (available < item.quantity) {
        failedProducts.push(item.productId);
      }
    }

    if (failedProducts.length > 0) {
      return { success: false, failedProducts };
    }

    for (const item of items) {
      const availableKey = `stock:${item.productId}:available`;
      const reservedKey = `stock:${item.productId}:reserved`;

      multi.decrby(availableKey, item.quantity);
      multi.incrby(reservedKey, item.quantity);
    }

    const reservationKey = `reservation:${orderId}`;
    multi.hmset(reservationKey, {
      items: JSON.stringify(items),
      createdAt: Date.now(),
    });
    multi.expire(reservationKey, this.RESERVATION_TTL);

    const results = await multi.exec();

    const allSuccess = results?.every(([err]) => !err);

    if (!allSuccess) {
      this.logger.error(`Failed to reserve stock for order ${orderId}`);
      await this.releaseReservation(orderId);
      return { success: false };
    }

    this.logger.log(`Stock reserved for order ${orderId}`);
    return { success: true };
  }

  /**
   * Release reservation (cancel order or timeout)
   */
  async releaseReservation(orderId: string): Promise<void> {
    const reservationKey = `reservation:${orderId}`;

    const reservation = await this.redis.hgetall(reservationKey);

    if (!reservation.items) {
      this.logger.warn(`No reservation found for order ${orderId}`);
      return;
    }

    const items: ReservationItem[] = JSON.parse(reservation.items);
    const multi = this.redis.multi();

    for (const item of items) {
      const availableKey = `stock:${item.productId}:available`;
      const reservedKey = `stock:${item.productId}:reserved`;

      multi.incrby(availableKey, item.quantity);
      multi.decrby(reservedKey, item.quantity);
    }

    multi.del(reservationKey);

    await multi.exec();
    this.logger.log(`Reservation released for order ${orderId}`);
  }

  /**
   * Convert reservation to sold (payment confirmed)
   */
  async confirmSale(orderId: string): Promise<void> {
    const reservationKey = `reservation:${orderId}`;

    const reservation = await this.redis.hgetall(reservationKey);

    if (!reservation.items) {
      this.logger.warn(`No reservation found for order ${orderId}`);
      return;
    }

    const items: ReservationItem[] = JSON.parse(reservation.items);
    const multi = this.redis.multi();

    for (const item of items) {
      const reservedKey = `stock:${item.productId}:reserved`;
      const soldKey = `stock:${item.productId}:sold`;

      multi.decrby(reservedKey, item.quantity);
      multi.incrby(soldKey, item.quantity);
    }

    multi.del(reservationKey);

    await multi.exec();
    this.logger.log(`Sale confirmed for order ${orderId}`);
  }

  /**
   * Sync Redis stock from database
   */
  async syncStockFromDB(
    productId: string,
    available: number,
    sold: number,
    reserved: number = 0,
  ) {
    const multi = this.redis.multi();

    multi.set(`stock:${productId}:available`, available);
    multi.set(`stock:${productId}:reserved`, reserved);
    multi.set(`stock:${productId}:sold`, sold);

    await multi.exec();

    this.logger.log(
      `Synced stock for ${productId}: available=${available}, reserved=${reserved}, sold=${sold}`,
    );
  }

  /**
   * Get stock status from Redis
   */
  async getStockStatus(productId: string): Promise<{
    available: number;
    reserved: number;
    sold: number;
    total: number;
  }> {
    const [available, reserved, sold] = await Promise.all([
      this.redis.get(`stock:${productId}:available`),
      this.redis.get(`stock:${productId}:reserved`),
      this.redis.get(`stock:${productId}:sold`),
    ]);

    const availableNum = parseInt(available || '0');
    const reservedNum = parseInt(reserved || '0');
    const soldNum = parseInt(sold || '0');

    return {
      available: availableNum,
      reserved: reservedNum,
      sold: soldNum,
      total: availableNum + reservedNum + soldNum,
    };
  }

  /**
   * Get stock info
   */
  async getStockInfo(productId: string) {
    const [available, reserved, sold] = await this.redis.mget(
      `stock:${productId}:available`,
      `stock:${productId}:reserved`,
      `stock:${productId}:sold`,
    );

    return {
      available: parseInt(available || '0', 10),
      reserved: parseInt(reserved || '0', 10),
      sold: parseInt(sold || '0', 10),
    };
  }

  /**
   * Cleanup expired reservations (cron job)
   */
  async cleanupExpiredReservations(): Promise<number> {
    const pattern = 'reservation:*';
    let cursor = '0';
    let cleaned = 0;

    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;

      for (const key of keys) {
        const ttl = await this.redis.ttl(key);

        if (ttl <= 0) {
          const orderId = key.replace('reservation:', '');
          await this.releaseReservation(orderId);
          cleaned++;
        }
      }
    } while (cursor !== '0');

    this.logger.log(`Cleaned up ${cleaned} expired reservations`);
    return cleaned;
  }
}
