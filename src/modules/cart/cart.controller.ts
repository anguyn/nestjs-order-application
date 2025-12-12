import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
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
import { CartService } from './cart.service';
import { JwtAuthGuard } from '@shared/guards/jwt-auth.guard';
import { Permissions } from '@shared/decorators/permissions.decorator';
import { Permission } from '@shared/constants/permissions.constant';
import { CurrentUser, GetLanguage } from '@shared/decorators/user.decorator';
import type { AuthenticatedUser } from '@shared/types/common.types';
import { AddToCartDto, UpdateCartItemDto } from './dto/cart.dto';

@ApiTags('Cart')
@Controller('cart')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @Permissions(Permission.ORDER_CREATE)
  @ApiOperation({ summary: 'Get user cart' })
  @ApiResponse({ status: 200, description: 'Cart retrieved successfully' })
  async getCart(
    @CurrentUser() user: AuthenticatedUser,
    @GetLanguage() lang: string,
  ) {
    return this.cartService.getCart(user.id, lang);
  }

  @Post('items')
  @Permissions(Permission.ORDER_CREATE)
  @ApiOperation({ summary: 'Add item to cart' })
  @ApiResponse({ status: 200, description: 'Item added to cart' })
  async addToCart(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddToCartDto,
    @GetLanguage() lang: string,
  ) {
    return this.cartService.addToCart(user.id, dto, lang);
  }

  @Put('items/:itemId')
  @Permissions(Permission.ORDER_CREATE)
  @ApiOperation({ summary: 'Update cart item quantity' })
  @ApiResponse({ status: 200, description: 'Cart item updated' })
  async updateCartItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
    @GetLanguage() lang: string,
  ) {
    return this.cartService.updateCartItem(user.id, itemId, dto, lang);
  }

  @Delete('items/:itemId')
  @HttpCode(HttpStatus.OK)
  @Permissions(Permission.ORDER_CREATE)
  @ApiOperation({ summary: 'Remove item from cart' })
  @ApiResponse({ status: 200, description: 'Item removed from cart' })
  async removeFromCart(
    @CurrentUser() user: AuthenticatedUser,
    @Param('itemId') itemId: string,
    @GetLanguage() lang: string,
  ) {
    return this.cartService.removeFromCart(user.id, itemId, lang);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @Permissions(Permission.ORDER_CREATE)
  @ApiOperation({ summary: 'Clear cart' })
  @ApiResponse({ status: 200, description: 'Cart cleared' })
  async clearCart(
    @CurrentUser() user: AuthenticatedUser,
    @GetLanguage() lang: string,
  ) {
    return this.cartService.clearCart(user.id, lang);
  }
}
