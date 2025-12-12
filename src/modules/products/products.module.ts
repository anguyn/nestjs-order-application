import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { EditLocksModule } from '@modules/edit-locks/edit-locks.module';
import { PrismaModule } from '@database/prisma.module';

@Module({
  imports: [PrismaModule, EditLocksModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
