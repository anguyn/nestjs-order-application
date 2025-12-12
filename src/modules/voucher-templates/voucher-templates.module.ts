import { Module } from '@nestjs/common';
import { VoucherTemplatesController } from './voucher-templates.controller';
import { VoucherTemplatesService } from './voucher-templates.service';
import { PrismaModule } from '@database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [VoucherTemplatesController],
  providers: [VoucherTemplatesService],
  exports: [VoucherTemplatesService],
})
export class VoucherTemplatesModule {}
