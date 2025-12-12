import {
  IsString,
  IsNumber,
  IsEnum,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum VoucherStatus {
  ACTIVE = 'ACTIVE',
  USED = 'USED',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
}

export class ClaimVoucherDto {
  @ApiProperty()
  @IsString()
  templateId: string;
}

export class ValidateVoucherDto {
  @ApiProperty()
  @IsString()
  code: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  orderAmount: number;
}

export class QueryMyVouchersDto {
  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ enum: VoucherStatus })
  @IsEnum(VoucherStatus)
  @IsOptional()
  status?: VoucherStatus;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  eventId?: string;
}
