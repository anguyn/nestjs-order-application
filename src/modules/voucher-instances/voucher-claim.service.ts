import { Injectable, Inject, Logger, ConflictException } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '@shared/constants/global.constant';
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class VoucherClaimService {
  private readonly logger = new Logger(VoucherClaimService.name);

  private readonly CLAIM_SCRIPT = `
    local template_key = KEYS[1]
    local event_key = KEYS[2]
    local user_claims_key = KEYS[3]
    
    local template_remaining = tonumber(redis.call('GET', template_key) or 0)
    local event_remaining = tonumber(redis.call('GET', event_key) or 0)
    local user_claim_count = tonumber(redis.call('GET', user_claims_key) or 0)
    local max_per_user = tonumber(ARGV[1])
    
    -- Check template availability
    if template_remaining <= 0 then
      return {0, 'template_sold_out'}
    end
    
    -- Check event availability
    if event_remaining <= 0 then
      return {0, 'event_sold_out'}
    end
    
    -- Check user limit
    if max_per_user > 0 and user_claim_count >= max_per_user then
      return {0, 'max_per_user_reached'}
    end
    
    -- Decrement atomically
    redis.call('DECR', template_key)
    redis.call('DECR', event_key)
    redis.call('INCR', user_claims_key)
    redis.call('EXPIRE', user_claims_key, 86400 * 7) -- 7 days
    
    return {1, 'success'}
  `;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly i18n: I18nService,
  ) {}

  /**
   * Atomic voucher claim check
   * Returns: { canClaim: boolean, reason?: string }
   */
  async attemptClaim(
    templateId: string,
    eventId: string,
    userId: string,
    maxPerUser: number = 0,
    lang = 'en',
  ): Promise<{ canClaim: boolean; reason?: string }> {
    const templateKey = `voucher:template:${templateId}:remaining`;
    const eventKey = `voucher:event:${eventId}:remaining`;
    const userClaimsKey = `voucher:user:${userId}:template:${templateId}:count`;

    try {
      const result: any = await this.redis.eval(
        this.CLAIM_SCRIPT,
        3,
        templateKey,
        eventKey,
        userClaimsKey,
        maxPerUser.toString(),
      );

      const [success, reason] = result;

      if (success === 1) {
        this.logger.log(
          `User ${userId} claimed voucher from template ${templateId}`,
        );
        return { canClaim: true };
      }

      return {
        canClaim: false,
        reason: this.i18n.translate(`voucher.${reason}`, { lang }),
      };
    } catch (error) {
      this.logger.error('Voucher claim error:', error);
      throw error;
    }
  }

  /**
   * Initialize voucher counters from database
   */
  async initializeVoucherCounters(
    templateId: string,
    eventId: string,
    templateRemaining: number,
    eventRemaining: number,
  ): Promise<void> {
    const templateKey = `voucher:template:${templateId}:remaining`;
    const eventKey = `voucher:event:${eventId}:remaining`;

    await this.redis
      .multi()
      .setnx(templateKey, templateRemaining)
      .setnx(eventKey, eventRemaining)
      .exec();

    this.logger.log(
      `Voucher counters initialized: template ${templateId}, event ${eventId}`,
    );
  }

  /**
   * Release voucher (rollback on error)
   */
  async releaseClaim(
    templateId: string,
    eventId: string,
    userId: string,
  ): Promise<void> {
    const templateKey = `voucher:template:${templateId}:remaining`;
    const eventKey = `voucher:event:${eventId}:remaining`;
    const userClaimsKey = `voucher:user:${userId}:template:${templateId}:count`;

    await this.redis
      .multi()
      .incr(templateKey)
      .incr(eventKey)
      .decr(userClaimsKey)
      .exec();

    this.logger.log(`Voucher claim released for user ${userId}`);
  }

  /**
   * Sync counters from database (scheduled job)
   */
  async syncCountersFromDB(
    templateId: string,
    eventId: string,
    dbTemplateIssued: number,
    dbTemplateMax: number,
    dbEventIssued: number,
    dbEventMax: number,
  ): Promise<void> {
    const templateKey = `voucher:template:${templateId}:remaining`;
    const eventKey = `voucher:event:${eventId}:remaining`;

    const templateRemaining = dbTemplateMax - dbTemplateIssued;
    const eventRemaining = dbEventMax - dbEventIssued;

    await this.redis
      .multi()
      .set(templateKey, Math.max(0, templateRemaining))
      .set(eventKey, Math.max(0, eventRemaining))
      .exec();

    this.logger.log(`Voucher counters synced for template ${templateId}`);
  }

  /**
   * Get current counters
   */
  async getCounters(templateId: string, eventId: string) {
    const templateKey = `voucher:template:${templateId}:remaining`;
    const eventKey = `voucher:event:${eventId}:remaining`;

    const [templateRemaining, eventRemaining] = await this.redis.mget(
      templateKey,
      eventKey,
    );

    return {
      templateRemaining: parseInt(templateRemaining || '0', 10),
      eventRemaining: parseInt(eventRemaining || '0', 10),
    };
  }
}
