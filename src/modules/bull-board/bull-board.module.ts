import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ExpressAdapter } from '@bull-board/express';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { createBullBoard } from '@bull-board/api';

@Module({
  imports: [
    // Import tất cả queues cần monitor
    BullModule.registerQueue(
      { name: 'email' },
      { name: 'order-expiry' },
      { name: 'payment-processing' },
    ),
  ],
  providers: [
    {
      provide: 'BULL_BOARD_INSTANCE',
      inject: [
        'BullQueue_email',
        'BullQueue_order-expiry',
        'BullQueue_payment-processing',
      ],
      useFactory: (
        emailQueue: any,
        orderExpiryQueue: any,
        paymentQueue: any,
      ) => {
        const serverAdapter = new ExpressAdapter();
        serverAdapter.setBasePath('/admin/queues');

        createBullBoard({
          queues: [
            new BullAdapter(emailQueue),
            new BullAdapter(orderExpiryQueue),
            new BullAdapter(paymentQueue),
          ],
          serverAdapter,
        });

        return serverAdapter;
      },
    },
  ],
  exports: ['BULL_BOARD_INSTANCE'],
})
export class BullBoardModule {}
