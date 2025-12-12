import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../constants/global.constant';

const PAYMENT_ACTIVE_KEY = 'payment:active'; // Set of active payment sessions
const PAYMENT_WAITING_KEY = 'payment:waiting'; // List of waiting orders
const PAYMENT_SESSION_PREFIX = 'payment:session:'; // Hash for session data
const PAYMENT_EXPIRE_SECONDS = 900; // 15 minutes

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  /**
   * ==========================================
   * PAYMENT QUEUE - NEW ARCHITECTURE
   * ==========================================
   */

  /**
   * Try to start payment session
   * Returns: { canStart: true, position: null } if can start immediately
   *          { canStart: false, position: N } if must wait
   */
  async tryStartPaymentSession(
    orderId: string,
    userId: string,
    maxConcurrent: number = 1,
  ) {
    const isActive = await this.redis.sismember(PAYMENT_ACTIVE_KEY, orderId);
    if (isActive) {
      // Already active - check if session still valid
      const session = await this.redis.hgetall(
        `${PAYMENT_SESSION_PREFIX}${orderId}`,
      );
      if (session && Object.keys(session).length > 0) {
        this.logger.log(`Order ${orderId} already has active session`);
        return { canStart: true, position: null };
      }
      // Session expired but still in active - cleanup
      this.logger.warn(`Cleaning up expired session for order ${orderId}`);
      await this.redis.srem(PAYMENT_ACTIVE_KEY, orderId);
    }

    const waitingList = await this.redis.lrange(PAYMENT_WAITING_KEY, 0, -1);
    const existingIndex = waitingList.indexOf(orderId);
    if (existingIndex !== -1) {
      // Already in queue - return position
      this.logger.log(
        `Order ${orderId} already in queue at position ${existingIndex + 1}`,
      );
      return { canStart: false, position: existingIndex + 1 };
    }

    const activeCount = await this.redis.scard(PAYMENT_ACTIVE_KEY);

    if (activeCount < maxConcurrent) {
      // Can start immediately
      const startedAtUnix = Math.floor(Date.now() / 1000);
      const expiresAtUnix = startedAtUnix + PAYMENT_EXPIRE_SECONDS;

      await this.redis
        .multi()
        .sadd(PAYMENT_ACTIVE_KEY, orderId)
        .hset(`${PAYMENT_SESSION_PREFIX}${orderId}`, {
          userId,
          startedAt: new Date().toISOString(),
          startedAtUnix: startedAtUnix.toString(),
          expiresAtUnix: expiresAtUnix.toString(),
        })
        .expire(`${PAYMENT_SESSION_PREFIX}${orderId}`, PAYMENT_EXPIRE_SECONDS)
        .exec();

      this.logger.log(`Payment session started for order ${orderId}`);

      return { canStart: true, position: null };
    } else {
      // Must wait - add to waiting queue
      await this.redis.rpush(PAYMENT_WAITING_KEY, orderId);
      const position = await this.redis.llen(PAYMENT_WAITING_KEY);

      this.logger.log(
        `Order ${orderId} added to waiting queue at position ${position}`,
      );

      return { canStart: false, position };
    }
  }

  /**
   * Complete payment session and process next in queue
   */
  async completePaymentSession(orderId: string, maxConcurrent: number = 1) {
    // Remove from active
    await this.redis
      .multi()
      .srem(PAYMENT_ACTIVE_KEY, orderId)
      .del(`${PAYMENT_SESSION_PREFIX}${orderId}`)
      .exec();

    this.logger.log(`Payment session completed for order ${orderId}`);

    // Check if can process next
    const activeCount = await this.redis.scard(PAYMENT_ACTIVE_KEY);

    if (activeCount < maxConcurrent) {
      const nextOrderId = await this.redis.lpop(PAYMENT_WAITING_KEY);

      if (nextOrderId) {
        this.logger.log(`Processing next order in queue: ${nextOrderId}`);
        return { hasNext: true, nextOrderId };
      }
    }

    return { hasNext: false, nextOrderId: null };
  }

  /**
   * Cancel/expire payment session
   */
  async cancelPaymentSession(orderId: string, maxConcurrent: number = 1) {
    return await this.completePaymentSession(orderId, maxConcurrent);
  }

  /**
   * Get waiting position for order
   */
  async getWaitingPosition(orderId: string) {
    const waitingList = await this.redis.lrange(PAYMENT_WAITING_KEY, 0, -1);
    const position = waitingList.indexOf(orderId);

    if (position === -1) {
      // Not in waiting queue - check if active
      const isActive = await this.redis.sismember(PAYMENT_ACTIVE_KEY, orderId);
      if (isActive) {
        return { status: 'ACTIVE', position: 0, total: waitingList.length };
      }
      return { status: 'NOT_FOUND', position: -1, total: waitingList.length };
    }

    return {
      status: 'WAITING',
      position: position + 1, // 1-indexed
      total: waitingList.length,
    };
  }

  /**
   * Get queue stats
   */
  async getPaymentQueueStats() {
    const [activeCount, waitingCount] = await Promise.all([
      this.redis.scard(PAYMENT_ACTIVE_KEY),
      this.redis.llen(PAYMENT_WAITING_KEY),
    ]);

    return {
      active: activeCount,
      waiting: waitingCount,
      total: activeCount + waitingCount,
    };
  }

  /**
   * Remove order from waiting queue (when user cancels)
   */
  async removeFromWaitingQueue(orderId: string) {
    const removed = await this.redis.lrem(PAYMENT_WAITING_KEY, 0, orderId);
    this.logger.log(
      `Removed order ${orderId} from waiting queue: ${removed > 0}`,
    );
    return removed > 0;
  }

  /**
   * Check if payment session is active
   */
  async isPaymentSessionActive(orderId: string) {
    return (await this.redis.sismember(PAYMENT_ACTIVE_KEY, orderId)) === 1;
  }

  /**
   * Get payment session data
   */
  async getPaymentSession(orderId: string): Promise<{
    userId: string;
    startedAt: string;
    startedAtUnix: number;
    expiresAtUnix: number;
    remainingSeconds: number;
  } | null> {
    const session = await this.redis.hgetall(
      `${PAYMENT_SESSION_PREFIX}${orderId}`,
    );

    if (!session || Object.keys(session).length === 0) {
      return null;
    }

    const nowUnix = Math.floor(Date.now() / 1000);
    const expiresAtUnix = parseInt(session.expiresAtUnix || '0', 10);
    const remainingSeconds = Math.max(0, expiresAtUnix - nowUnix);

    return {
      userId: session.userId,
      startedAt: session.startedAt,
      startedAtUnix: parseInt(session.startedAtUnix || '0', 10),
      expiresAtUnix: expiresAtUnix,
      remainingSeconds: remainingSeconds,
    };
  }

  /**
   * Cleanup expired sessions (called by cron)
   * Returns list of expired orderIds
   */
  async cleanupExpiredSessions() {
    const activeSessions = await this.redis.smembers(PAYMENT_ACTIVE_KEY);
    const expiredOrders: string[] = [];

    for (const orderId of activeSessions) {
      const exists = await this.redis.exists(
        `${PAYMENT_SESSION_PREFIX}${orderId}`,
      );

      if (!exists) {
        // Session expired but still in active set - cleanup
        await this.redis.srem(PAYMENT_ACTIVE_KEY, orderId);
        expiredOrders.push(orderId);
        this.logger.warn(`Cleaned up expired session for order ${orderId}`);
      }
    }

    return expiredOrders;
  }

  /**
   * Clear all payment queue (admin only)
   */
  async clearPaymentQueue() {
    const activeSessions = await this.redis.smembers(PAYMENT_ACTIVE_KEY);
    const waitingOrders = await this.redis.lrange(PAYMENT_WAITING_KEY, 0, -1);

    // Delete all active sessions
    for (const orderId of activeSessions) {
      await this.redis.del(`${PAYMENT_SESSION_PREFIX}${orderId}`);
    }

    // Clear Redis keys
    await this.redis.del(PAYMENT_ACTIVE_KEY);
    await this.redis.del(PAYMENT_WAITING_KEY);

    this.logger.log(
      `Cleared payment queue: ${activeSessions.length} active, ${waitingOrders.length} waiting`,
    );

    return {
      cleared: {
        active: activeSessions.length,
        waiting: waitingOrders.length,
        total: activeSessions.length + waitingOrders.length,
      },
    };
  }

  /**
   * ==========================================
   * OLD PAYMENT QUEUE - DEPRECATED
   * ==========================================
   */

  async addToPaymentQueue(orderId: string): Promise<number> {
    const queueKey = 'payment:queue:old';
    await this.redis.rpush(queueKey, orderId);
    return await this.redis.llen(queueKey);
  }

  async removeFromPaymentQueue(orderId: string): Promise<void> {
    const queueKey = 'payment:queue:old';
    await this.redis.lrem(queueKey, 1, orderId);
  }

  async getQueuePosition(
    orderId: string,
  ): Promise<{ position: number; total: number }> {
    const queueKey = 'payment:queue:old';
    const queue = await this.redis.lrange(queueKey, 0, -1);
    const position = queue.indexOf(orderId);

    return {
      position: position === -1 ? -1 : position + 1,
      total: queue.length,
    };
  }

  async getQueueSize(): Promise<number> {
    const queueKey = 'payment:queue:old';
    return await this.redis.llen(queueKey);
  }

  async getQueueList(): Promise<string[]> {
    const queueKey = 'payment:queue:old';
    return await this.redis.lrange(queueKey, 0, -1);
  }

  /**
   * ==========================================
   * GENERIC CACHE
   * ==========================================
   */
  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    return value ? JSON.parse(value) : null;
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttl) {
      await this.redis.set(key, serialized, 'EX', ttl);
    } else {
      await this.redis.set(key, serialized);
    }
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  /**
   * ==========================================
   * HEALTH CHECK
   * ==========================================
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch (error) {
      this.logger.error('Redis ping failed:', error);
      return false;
    }
  }

  async getStats() {
    try {
      const info = await this.redis.info();
      const queueStats = await this.getPaymentQueueStats();

      return {
        connected: true,
        uptime: info.match(/uptime_in_seconds:(\d+)/)?.[1],
        connectedClients: info.match(/connected_clients:(\d+)/)?.[1],
        usedMemory: info.match(/used_memory_human:(.+)/)?.[1],
        paymentQueue: queueStats,
        oldQueueSize: await this.getQueueSize(),
      };
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }
}
