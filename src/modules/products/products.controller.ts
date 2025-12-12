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
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { EditLocksService } from '../edit-locks/edit-locks.service';
import { JwtAuthGuard } from '@shared/guards/jwt-auth.guard';
import { Permissions, Public } from '@shared/decorators/permissions.decorator';
import { Permission } from '@shared/constants/permissions.constant';
import { CurrentUser, GetLanguage } from '@shared/decorators/user.decorator';
import type { AuthenticatedUser } from '@shared/types/common.types';
import {
  CreateProductDto,
  UpdateProductDto,
  QueryProductsDto,
} from './dto/products.dto';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly editLocksService: EditLocksService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get all products' })
  @ApiResponse({ status: 200, description: 'Products retrieved successfully' })
  async getAllProducts(@Query() query: QueryProductsDto) {
    return this.productsService.getProducts(query);
  }

  @Public()
  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get product by slug' })
  @ApiResponse({ status: 200, description: 'Product retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async getProductBySlug(
    @Param('slug') slug: string,
    @GetLanguage() lang: string,
  ) {
    return this.productsService.getProductBySlug(slug, lang);
  }

  @Public()
  @Get(':productId')
  @ApiOperation({ summary: 'Get product by ID' })
  @ApiResponse({ status: 200, description: 'Product retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async getProductById(
    @Param('productId') productId: string,
    @GetLanguage() lang: string,
  ) {
    return this.productsService.getProductById(productId, lang);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiBearerAuth()
  @Permissions(Permission.EVENT_CREATE) // Reuse event permission or create product permission
  @ApiOperation({ summary: 'Create new product' })
  @ApiResponse({ status: 201, description: 'Product created successfully' })
  async createProduct(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: AuthenticatedUser,
    @GetLanguage() lang: string,
  ) {
    return this.productsService.createProduct(dto, user.id, lang);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':productId')
  @ApiBearerAuth()
  @Permissions(Permission.EVENT_UPDATE)
  @ApiOperation({ summary: 'Update product' })
  @ApiResponse({ status: 200, description: 'Product updated successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async updateProduct(
    @Param('productId') productId: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthenticatedUser,
    @GetLanguage() lang: string,
  ) {
    return this.productsService.updateProduct(productId, dto, user.id, lang);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':productId')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @Permissions(Permission.EVENT_DELETE)
  @ApiOperation({ summary: 'Delete product' })
  @ApiResponse({ status: 200, description: 'Product deleted successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async deleteProduct(
    @Param('productId') productId: string,
    @CurrentUser() user: AuthenticatedUser,
    @GetLanguage() lang: string,
  ) {
    await this.productsService.deleteProduct(productId, user.id, lang);
    return { message: 'Product deleted successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Post(':productId/lock')
  @ApiBearerAuth()
  @Permissions(Permission.EVENT_UPDATE)
  @ApiOperation({ summary: 'Acquire edit lock for product' })
  @ApiResponse({ status: 200, description: 'Lock acquired successfully' })
  async acquireLock(
    @Param('productId') productId: string,
    @CurrentUser() user: AuthenticatedUser,
    @GetLanguage() lang: string,
  ) {
    return this.editLocksService.acquireLock(
      'product',
      productId,
      user.id,
      user.email,
      lang,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(':productId/unlock')
  @ApiBearerAuth()
  @Permissions(Permission.EVENT_UPDATE)
  @ApiOperation({ summary: 'Release edit lock for product' })
  @ApiResponse({ status: 200, description: 'Lock released successfully' })
  async releaseLock(
    @Param('productId') productId: string,
    @CurrentUser() user: AuthenticatedUser,
    @GetLanguage() lang: string,
  ) {
    await this.editLocksService.releaseLock(
      'product',
      productId,
      user.id,
      lang,
    );
    return { message: 'Lock released successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Post(':productId/maintain-lock')
  @ApiBearerAuth()
  @Permissions(Permission.EVENT_UPDATE)
  @ApiOperation({ summary: 'Maintain/extend edit lock' })
  @ApiResponse({ status: 200, description: 'Lock maintained successfully' })
  async maintainLock(
    @Param('productId') productId: string,
    @CurrentUser() user: AuthenticatedUser,
    @GetLanguage() lang: string,
  ) {
    return this.editLocksService.maintainLock(
      'product',
      productId,
      user.id,
      lang,
    );
  }
}
