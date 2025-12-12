import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { VoucherInstancesModule } from '../voucher-instances/voucher-instances.module';
import { EmailModule } from '../email/email.module';
import { PrismaModule } from '@database/prisma.module';

@Module({
  imports: [PrismaModule, VoucherInstancesModule, EmailModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
