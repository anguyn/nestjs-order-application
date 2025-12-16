import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';

export const bullQueueConfig = BullModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: (config: ConfigService) => ({
    redis: {
      host: config.get('REDIS_HOST', 'localhost'),
      port: config.get('REDIS_PORT', 6379),
      password: config.get('REDIS_PASSWORD'),
      db: config.get('REDIS_DB', 0),
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    },
    defaultJobOptions: {
      removeOnComplete: {
        age: 24 * 3600,
        count: 1000,
      },
      removeOnFail: false,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      timeout: 60000,
    },
    settings: {
      stalledInterval: 30000,
      maxStalledCount: 2,
      lockDuration: 30000,
    },
  }),
  inject: [ConfigService],
});

export const emailQueueConfig = {
  name: 'email',
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    timeout: 30000,
    removeOnComplete: {
      age: 3600,
      count: 500,
    },
  },
};

export const orderExpiryQueueConfig = {
  name: 'order-expiry',
  defaultJobOptions: {
    attempts: 1,
    timeout: 120000,
    removeOnComplete: {
      age: 86400,
      count: 10000,
    },
    removeOnFail: false,
  },
};

export const paymentQueueConfig = {
  name: 'payment-processing',
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'fixed',
      delay: 10000,
    },
    timeout: 90000,
    removeOnComplete: {
      age: 86400,
      count: 5000,
    },
    removeOnFail: false,
  },
};
