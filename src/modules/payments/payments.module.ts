import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PaymentsService } from './payments.service';
import { PaymentIdempotencyService } from './payment-idempotency.service';
import { PaymentsController } from './payments.controller';
import { PaymentsProcessor } from './payments.processor';
import { PrismaModule } from '@database/prisma.module';
import { RedisModule } from '@shared/redis/redis.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { OrdersModule } from '@modules/orders/orders.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    NotificationsModule,
    OrdersModule,
    BullModule.registerQueue(
      {
        name: 'payment-processing',
      },
      { name: 'order-expiry' },
    ),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsProcessor, PaymentIdempotencyService],
  exports: [PaymentsService, PaymentIdempotencyService],
})
export class PaymentsModule {}
