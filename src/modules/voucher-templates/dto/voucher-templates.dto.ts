import {
  IsString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsArray,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum DiscountType {
  FIXED = 'FIXED', // Giảm số tiền cố định trên sản phẩm
  PERCENTAGE = 'PERCENTAGE', // Giảm % trên sản phẩm
  FREE_SHIPPING = 'FREE_SHIPPING', // Miễn phí ship (hoặc giảm phí ship)
}

export enum VoucherType {
  SINGLE_USE = 'SINGLE_USE', // Dùng 1 lần
  MULTI_USE = 'MULTI_USE', // Dùng nhiều lần
  SPECIFIC_USER = 'SPECIFIC_USER', // Chỉ dành cho user cụ thể
}

export class CreateVoucherTemplateDto {
  @ApiProperty()
  @IsString()
  eventId: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Optional fixed code' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ enum: DiscountType })
  @IsEnum(DiscountType)
  discountType: DiscountType;

  @ApiProperty({
    description:
      'Discount value. For PERCENTAGE: 1-100. For FIXED/FREE_SHIPPING: amount in VND',
  })
  @IsNumber()
  @Min(0)
  discountValue: number;

  @ApiPropertyOptional({ description: 'Minimum order amount to use voucher' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderAmount?: number;

  @ApiPropertyOptional({
    description: 'Maximum discount amount (not applicable for FREE_SHIPPING)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDiscountAmount?: number;

  @ApiProperty({ enum: VoucherType })
  @IsEnum(VoucherType)
  type: VoucherType;

  @ApiPropertyOptional({
    description: 'Max usage count for MULTI_USE vouchers',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxUsageCount?: number;

  @ApiPropertyOptional({ description: 'Max vouchers per user' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxPerUser?: number;

  @ApiProperty({ description: 'Maximum number of vouchers to issue' })
  @IsNumber()
  @Min(1)
  maxIssue: number;

  @ApiPropertyOptional({
    description: 'Target user IDs for SPECIFIC_USER type',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetUserIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateVoucherTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: DiscountType })
  @IsOptional()
  @IsEnum(DiscountType)
  discountType?: DiscountType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDiscountAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxPerUser?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxIssue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class QueryTemplatesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  eventId?: string;

  @ApiPropertyOptional({ enum: VoucherType })
  @IsOptional()
  @IsEnum(VoucherType)
  type?: VoucherType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
