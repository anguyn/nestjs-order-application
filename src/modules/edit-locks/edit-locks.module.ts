import { Module } from '@nestjs/common';
import { EditLocksService } from './edit-locks.service';
import { PrismaModule } from '@database/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [EditLocksService],
  exports: [EditLocksService],
})
export class EditLocksModule {}
