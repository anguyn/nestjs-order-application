import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { EditLocksModule } from '../edit-locks/edit-locks.module';
import { PrismaModule } from '@database/prisma.module';

@Module({
  imports: [PrismaModule, EditLocksModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
