import { Module, Global, OnModuleInit, Logger } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisService } from './redis.service';
import { StockReservationService } from './stock-reservation.service';
import { RedisInitService } from './redis-init.service';
import { REDIS_CLIENT } from '../constants/global.constant';
import { VoucherInstancesModule } from '@modules/voucher-instances/voucher-instances.module';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (config: ConfigService) => {
        // HARDCODE DB 1 for Bull
        const db = 1;
        console.log(`🔧 [Bull] HARDCODED DB: ${db}`);
        return {
          redis: {
            host: config.get('redis.host', 'localhost'),
            port: config.get('redis.port', 6379),
            password: config.get('redis.password'),
            db: db,
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
          },
          defaultJobOptions: {
            removeOnComplete: 100,
            removeOnFail: 1000,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
          },
        };
      },
      inject: [ConfigService],
    }),
    VoucherInstancesModule,
  ],
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (config: ConfigService) => {
        // HARDCODE DB 1 - bypass ConfigService issue
        const db = 1;
        const host = config.get('redis.host', 'localhost');
        const port = config.get('redis.port', 6379);
        const password = config.get('redis.password');

        console.log(`🔧 [Redis Client] HARDCODED DB: ${db}`);
        console.log(`   Host: ${host}:${port}`);

        const client = new Redis({
          host: host,
          port: port,
          password: password,
          db: db, // ← FORCE DB 1
          retryStrategy: (times: number) => {
            return Math.min(times * 50, 2000);
          },
          maxRetriesPerRequest: 3,
        });

        client.on('connect', () => {
          console.log(`✅ [Redis Client] Connected to DB ${db}`);
        });

        client.on('error', (err) => {
          console.error(`❌ [Redis Client] Error:`, err.message);
        });

        return client;
      },
      inject: [ConfigService],
    },
    RedisService,
    StockReservationService,
    RedisInitService,
  ],
  exports: [
    REDIS_CLIENT,
    RedisService,
    BullModule,
    StockReservationService,
    RedisInitService,
  ],
})
export class RedisModule implements OnModuleInit {
  private readonly logger = new Logger(RedisModule.name);

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit() {
    this.logger.log(`📡 Redis module initialized - HARDCODED DB: 1`);

    try {
      const info = await this.redis.getStats();
      this.logger.log(`📊 Redis Stats: ${JSON.stringify(info)}`);
    } catch (error) {
      this.logger.error('❌ Failed to get Redis stats:', error);
    }
  }
}
