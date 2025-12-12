import {
  IsString,
  IsArray,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '@generated/prisma/client';
import { Type } from 'class-transformer';

export enum PaymentMethod {
  VIETQR = 'VIETQR',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CASH = 'CASH',
}

export class CreateOrderDto {
  @ApiPropertyOptional({
    description: 'Address ID from saved addresses (optional)',
  })
  @IsOptional()
  @IsString()
  addressId?: string;

  @ApiPropertyOptional({
    description: 'Free text address (required if addressId not provided)',
  })
  @IsOptional()
  @IsString()
  addressText?: string;

  @ApiProperty({
    description: 'Payment method',
    enum: PaymentMethod,
    example: 'VIETQR',
  })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({
    description: 'Voucher codes to apply',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  voucherCodes?: string[];

  @ApiPropertyOptional({ description: 'Customer note' })
  @IsOptional()
  @IsString()
  customerNote?: string;
}

export class QueryOrdersDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ default: 'createdAt' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  adminNote?: string;
}
