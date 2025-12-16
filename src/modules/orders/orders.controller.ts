import {
  Controller,
  Get,
  Post,
  Put,
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
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '@shared/guards/jwt-auth.guard';
import { Permissions } from '@shared/decorators/permissions.decorator';
import { Permission } from '@shared/constants/permissions.constant';
import { CurrentUser, GetLanguage } from '@shared/decorators/user.decorator';
import type { AuthenticatedUser } from '@shared/types/common.types';
import {
  CreateOrderDto,
  QueryOrdersDto,
  UpdateOrderStatusDto,
} from './dto/orders.dto';

@ApiTags('Orders')
@Controller('orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Permissions(Permission.ORDER_CREATE)
  @ApiOperation({ summary: 'Create order from cart' })
  @ApiResponse({ status: 201, description: 'Order created successfully' })
  @ApiResponse({
    status: 400,
    description: 'Invalid data or insufficient stock',
  })
  async createOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrderDto,
    @GetLanguage() lang: string,
  ) {
    const order = await this.ordersService.createOrder(user.id, dto, lang);

    await this.ordersService.queueOrderConfirmationEmail(order);

    return order;
  }

  @Get()
  @Permissions(Permission.ORDER_READ)
  @ApiOperation({ summary: 'Get user orders' })
  @ApiResponse({ status: 200, description: 'Orders retrieved successfully' })
  async getUserOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryOrdersDto,
  ) {
    return this.ordersService.getUserOrders(user.id, query);
  }

  @Get('all')
  @Permissions(Permission.ORDER_READ_ALL)
  @ApiOperation({ summary: 'Get all orders (Admin)' })
  @ApiResponse({ status: 200, description: 'Orders retrieved successfully' })
  async getAllOrders(@Query() query: QueryOrdersDto) {
    return this.ordersService.getAllOrders(query);
  }

  @Get(':orderId')
  @Permissions(Permission.ORDER_READ)
  @ApiOperation({ summary: 'Get order by ID' })
  @ApiResponse({ status: 200, description: 'Order retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async getOrderById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @GetLanguage() lang: string,
  ) {
    return this.ordersService.getOrderById(orderId, user.id, lang);
  }

  @Post(':orderId/cancel')
  @HttpCode(HttpStatus.OK)
  @Permissions(Permission.ORDER_UPDATE)
  @ApiOperation({ summary: 'Cancel order' })
  @ApiResponse({ status: 200, description: 'Order cancelled successfully' })
  @ApiResponse({ status: 400, description: 'Cannot cancel order' })
  async cancelOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @GetLanguage() lang: string,
  ) {
    return this.ordersService.cancelOrder(orderId, user.id, lang);
  }

  @Put(':orderId/status')
  @Permissions(Permission.ORDER_UPDATE_ALL)
  @ApiOperation({ summary: 'Update order status (Admin)' })
  @ApiResponse({
    status: 200,
    description: 'Order status updated successfully',
  })
  async updateOrderStatus(
    @Param('orderId') orderId: string,
    @Body() dto: UpdateOrderStatusDto,
    @GetLanguage() lang: string,
  ) {
    return this.ordersService.updateOrderStatus(orderId, dto, lang);
  }
}
