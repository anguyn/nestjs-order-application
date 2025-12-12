import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VoucherInstancesService } from './voucher-instances.service';
import { JwtAuthGuard } from '@shared/guards/jwt-auth.guard';
import { Permissions } from '@shared/decorators/permissions.decorator';
import { Permission } from '@shared/constants/permissions.constant';
import { CurrentUser, GetLanguage } from '@shared/decorators/user.decorator';
import type { AuthenticatedUser } from '@shared/types/common.types';
import {
  ClaimVoucherDto,
  ValidateVoucherDto,
  QueryMyVouchersDto,
} from './dto/voucher-instances.dto';

@ApiTags('Voucher Instances')
@Controller('voucher-instances')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class VoucherInstancesController {
  constructor(
    private readonly voucherInstancesService: VoucherInstancesService,
  ) {}

  @Post('claim')
  @Permissions(Permission.VOUCHER_ISSUE)
  @ApiOperation({ summary: 'Claim voucher from template' })
  async claimVoucher(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ClaimVoucherDto,
    @GetLanguage() lang: string,
  ) {
    return this.voucherInstancesService.claimVoucher(user.id, dto, lang);
  }

  @Post('validate')
  @Permissions(Permission.VOUCHER_USE)
  @ApiOperation({ summary: 'Validate voucher and calculate discount' })
  async validateVoucher(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ValidateVoucherDto,
    @GetLanguage() lang: string,
  ) {
    return this.voucherInstancesService.validateVoucher(user.id, dto, lang);
  }

  @Get('my-vouchers')
  @Permissions(Permission.VOUCHER_READ)
  @ApiOperation({ summary: 'Get my vouchers' })
  async getMyVouchers(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryMyVouchersDto,
  ) {
    return this.voucherInstancesService.getMyVouchers(user.id, query);
  }

  @Get(':code')
  @Permissions(Permission.VOUCHER_READ)
  @ApiOperation({ summary: 'Get voucher by code' })
  async getVoucherByCode(
    @Param('code') code: string,
    @CurrentUser() user: AuthenticatedUser,
    @GetLanguage() lang: string,
  ) {
    return this.voucherInstancesService.getVoucherByCode(code, user.id, lang);
  }

  @Post(':instanceId/revoke')
  @HttpCode(HttpStatus.OK)
  @Permissions(Permission.VOUCHER_DELETE)
  @ApiOperation({ summary: 'Revoke voucher instance (Admin)' })
  async revokeVoucher(
    @Param('instanceId') instanceId: string,
    @GetLanguage() lang: string,
  ) {
    await this.voucherInstancesService.revokeVoucher(instanceId, lang);
    return { message: 'Voucher revoked successfully' };
  }
}
