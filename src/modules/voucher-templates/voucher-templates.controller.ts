import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VoucherTemplatesService } from './voucher-templates.service';
import { JwtAuthGuard } from '@shared/guards/jwt-auth.guard';
import { Permissions } from '@shared/decorators/permissions.decorator';
import { Permission } from '@shared/constants/permissions.constant';
import { GetLanguage } from '@shared/decorators/user.decorator';
import {
  CreateVoucherTemplateDto,
  UpdateVoucherTemplateDto,
  QueryTemplatesDto,
} from './dto/voucher-templates.dto';

@ApiTags('Voucher Templates')
@Controller('voucher-templates')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class VoucherTemplatesController {
  constructor(
    private readonly voucherTemplatesService: VoucherTemplatesService,
  ) {}

  @Post()
  @Permissions(Permission.VOUCHER_CREATE)
  @ApiOperation({ summary: 'Create voucher template (Admin)' })
  async createTemplate(
    @Body() dto: CreateVoucherTemplateDto,
    @GetLanguage() lang: string,
  ) {
    return this.voucherTemplatesService.createTemplate(dto, lang);
  }

  @Get()
  @Permissions(Permission.VOUCHER_READ_ALL)
  @ApiOperation({ summary: 'Get all templates (Admin)' })
  async getAllTemplates(@Query() query: QueryTemplatesDto) {
    return this.voucherTemplatesService.getAllTemplates(query);
  }

  @Get('event/:eventId')
  @ApiOperation({ summary: 'Get templates for an event (Public)' })
  async getEventTemplates(
    @Param('eventId') eventId: string,
    @GetLanguage() lang: string,
  ) {
    return this.voucherTemplatesService.getEventTemplates(eventId, lang);
  }

  @Get(':templateId')
  @Permissions(Permission.VOUCHER_READ)
  @ApiOperation({ summary: 'Get template by ID' })
  async getTemplateById(
    @Param('templateId') templateId: string,
    @GetLanguage() lang: string,
  ) {
    return this.voucherTemplatesService.getTemplateById(templateId, lang);
  }

  @Get(':templateId/stats')
  @Permissions(Permission.VOUCHER_READ_ALL)
  @ApiOperation({ summary: 'Get template statistics' })
  async getTemplateStats(
    @Param('templateId') templateId: string,
    @GetLanguage() lang: string,
  ) {
    return this.voucherTemplatesService.getTemplateStats(templateId, lang);
  }

  @Put(':templateId')
  @Permissions(Permission.VOUCHER_UPDATE)
  @ApiOperation({ summary: 'Update template (Admin)' })
  async updateTemplate(
    @Param('templateId') templateId: string,
    @Body() dto: UpdateVoucherTemplateDto,
    @GetLanguage() lang: string,
  ) {
    return this.voucherTemplatesService.updateTemplate(templateId, dto, lang);
  }

  @Delete(':templateId')
  @HttpCode(HttpStatus.OK)
  @Permissions(Permission.VOUCHER_DELETE)
  @ApiOperation({ summary: 'Delete template (Admin)' })
  async deleteTemplate(
    @Param('templateId') templateId: string,
    @GetLanguage() lang: string,
  ) {
    await this.voucherTemplatesService.deleteTemplate(templateId, lang);
    return { message: 'Template deleted successfully' };
  }
}
