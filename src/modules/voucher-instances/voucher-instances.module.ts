import { Module } from '@nestjs/common';
import { VoucherInstancesController } from './voucher-instances.controller';
import { VoucherInstancesService } from './voucher-instances.service';
import { PrismaModule } from '@database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [VoucherInstancesController],
  providers: [VoucherInstancesService],
  exports: [VoucherInstancesService],
})
export class VoucherInstancesModule {}
