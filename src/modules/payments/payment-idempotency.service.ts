import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '@shared/constants/global.constant';

@Injectable()
export class PaymentIdempotencyService {
  private readonly logger = new Logger(PaymentIdempotencyService.name);
  private readonly IDEMPOTENCY_TTL = 86400; // 24 hours
  private readonly RETRY_DELAY_MINUTES = 5;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Check and mark webhook as processed (atomic)
   * Returns: true if should process, false if duplicate/too soon
   */
  async checkAndMarkProcessed(
    orderId: string,
    transactionId: string,
  ): Promise<boolean> {
    const processedKey = `payment:processed:${orderId}:${transactionId}`;
    const failedKey = `payment:failed:${orderId}:${transactionId}`;

    const isProcessed = await this.redis.exists(processedKey);
    if (isProcessed) {
      this.logger.warn(
        `Duplicate: Payment already processed for order ${orderId}, transaction ${transactionId}`,
      );
      return false;
    }

    const failedData = await this.redis.get(failedKey);
    if (failedData) {
      const failed = JSON.parse(failedData);
      const failedAt = new Date(failed.failedAt);
      const now = new Date();
      const minutesSinceFailed = (now.getTime() - failedAt.getTime()) / 60000;

      if (minutesSinceFailed < this.RETRY_DELAY_MINUTES) {
        this.logger.warn(
          `Too soon to retry: Last failed ${minutesSinceFailed.toFixed(1)} minutes ago for order ${orderId}`,
        );
        return false;
      }

      await this.redis.del(failedKey);
      this.logger.log(
        `Retry allowed: Failed ${minutesSinceFailed.toFixed(1)} minutes ago for order ${orderId}`,
      );
    }

    const result = await this.redis.set(
      processedKey,
      JSON.stringify({
        processedAt: new Date().toISOString(),
        orderId,
        transactionId,
      }),
      'EX',
      this.IDEMPOTENCY_TTL,
      'NX',
    );

    const isFirstTime = result === 'OK';

    if (isFirstTime) {
      this.logger.log(
        `Processing payment for order ${orderId}, transaction ${transactionId}`,
      );
    }

    return isFirstTime;
  }

  /**
   * Check if payment was already processed (without marking)
   */
  async isProcessed(orderId: string, transactionId: string): Promise<boolean> {
    const key = `payment:processed:${orderId}:${transactionId}`;
    const exists = await this.redis.exists(key);
    return exists === 1;
  }

  /**
   * Get processing info
   */
  async getProcessingInfo(orderId: string, transactionId: string) {
    const key = `payment:processed:${orderId}:${transactionId}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Mark payment as failed (for retry logic)
   */
  async markAsFailed(
    orderId: string,
    transactionId: string,
    error: string,
  ): Promise<void> {
    const failedKey = `payment:failed:${orderId}:${transactionId}`;

    await this.redis.set(
      failedKey,
      JSON.stringify({
        failedAt: new Date().toISOString(),
        error,
        orderId,
        transactionId,
      }),
      'EX',
      this.IDEMPOTENCY_TTL,
    );

    this.logger.warn(
      `Marked as failed: order ${orderId}, transaction ${transactionId}, reason: ${error}`,
    );
  }

  /**
   * Delete failed mark (allow immediate retry)
   */
  async clearFailed(orderId: string, transactionId: string): Promise<void> {
    const failedKey = `payment:failed:${orderId}:${transactionId}`;
    await this.redis.del(failedKey);
    this.logger.log(`Cleared failed mark for order ${orderId}`);
  }

  /**
   * Cleanup old idempotency keys (optional, Redis will auto-expire)
   */
  async cleanup(): Promise<number> {
    let cleaned = 0;
    let cursor = '0';

    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        'payment:*:*',
        'COUNT',
        100,
      );
      cursor = nextCursor;

      for (const key of keys) {
        const ttl = await this.redis.ttl(key);
        if (ttl < 0) {
          await this.redis.del(key);
          cleaned++;
        }
      }
    } while (cursor !== '0');

    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} expired idempotency keys`);
    }
    return cleaned;
  }
}
