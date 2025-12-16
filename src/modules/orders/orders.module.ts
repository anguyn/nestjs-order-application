import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderExpiryProcessor } from './order-expiry.processor';
import { VoucherInstancesModule } from '../voucher-instances/voucher-instances.module';
import { EmailModule } from '../email/email.module';
import { PrismaModule } from '@database/prisma.module';
import { RedisModule } from '@shared/redis/redis.module';

@Module({
  imports: [
    PrismaModule,
    VoucherInstancesModule,
    EmailModule,
    RedisModule,
    BullModule.registerQueue({
      name: 'order-expiry',
    }),
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrderExpiryProcessor],
  exports: [OrdersService],
})
export class OrdersModule {}
