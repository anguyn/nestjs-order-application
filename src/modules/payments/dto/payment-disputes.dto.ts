import { IsString, IsEnum, IsOptional, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum DisputeStatus {
  PENDING = 'PENDING',
  RESOLVED = 'RESOLVED',
  REFUNDED = 'REFUNDED',
  REJECTED = 'REJECTED',
}

export class QueryDisputesDto {
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

  @ApiPropertyOptional({ enum: DisputeStatus })
  @IsOptional()
  @IsEnum(DisputeStatus)
  status?: DisputeStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  orderId?: string;
}

export class ResolveDisputeDto {
  @ApiProperty({ enum: ['ACCEPT', 'REJECT', 'REFUND'] })
  @IsEnum(['ACCEPT', 'REJECT', 'REFUND'])
  action: 'ACCEPT' | 'REJECT' | 'REFUND';

  @ApiProperty()
  @IsString()
  note: string;
}
