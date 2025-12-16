import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { JobManagementController } from './job-management.controller';
import { JobManagementService } from './job-management.service';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'email' },
      { name: 'order-expiry' },
      { name: 'payment-processing' },
    ),
  ],
  controllers: [JobManagementController],
  providers: [JobManagementService],
})
export class JobManagementModule {}
