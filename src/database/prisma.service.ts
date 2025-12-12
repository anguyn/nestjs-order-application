import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@generated/prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString = process.env.DATABASE_URL;

    const pool = new Pool({
      connectionString,
      ssl: {
        rejectUnauthorized: false,
        checkServerIdentity: () => undefined,
      },
      connectionTimeoutMillis: 10000,
    });
    const adapter = new PrismaPg(pool);

    super({
      adapter,
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('✅ PostgreSQL connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('PostgreSQL disconnected');
  }

  async executeTransaction<T>(
    fn: (
      prisma: Omit<
        PrismaClient,
        '$connect' | '$disconnect' | '$on' | '$transaction' | '$use'
      >,
    ) => Promise<T>,
    maxRetries = 3,
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.$transaction(fn, {
          maxWait: 5000,
          timeout: 10000,
          isolationLevel: 'Serializable',
        });
      } catch (error) {
        lastError = error as Error;

        if (this.isSerializationError(error as Error) && attempt < maxRetries) {
          const backoffMs = Math.pow(2, attempt) * 100;
          this.logger.warn(
            `⚠️  Transaction attempt ${attempt}/${maxRetries} failed, retrying in ${backoffMs}ms...`,
          );
          await this.sleep(backoffMs);
          continue;
        }

        throw error;
      }
    }

    throw lastError || new Error('Transaction failed after retries');
  }

  private isSerializationError(error: Error): boolean {
    const errorMessage = error.message.toLowerCase();
    return (
      errorMessage.includes('serialization') ||
      errorMessage.includes('deadlock') ||
      errorMessage.includes('could not serialize') ||
      errorMessage.includes('lock timeout')
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
