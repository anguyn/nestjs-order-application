import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiHeader,
} from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '@shared/guards/jwt-auth.guard';
import { PermissionsGuard } from '@shared/guards/permissions.guard';
import { Permissions } from '@shared/decorators/permissions.decorator';
import { Permission } from '@shared/constants/permissions.constant';
import { CurrentUser, GetLanguage } from '@shared/decorators/user.decorator';
import type { AuthenticatedUser } from '@shared/types/common.types';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('initiate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Khởi tạo phiên thanh toán',
    description: `
      Endpoint này xử lý việc khởi tạo phiên thanh toán cho đơn hàng.
      
      **Luồng xử lý:**
      1. Kiểm tra order tồn tại và thuộc về user
      2. Kiểm tra order đang ở trạng thái PENDING
      3. Thử khởi động payment session (kiểm tra concurrency limit)
      4. Nếu có slot: Tạo/cập nhật payment record và bắt đầu session
      5. Nếu hết slot: Thêm vào hàng đợi và trả về vị trí chờ
    `,
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['orderId'],
      properties: {
        orderId: {
          type: 'string',
          description: 'ID của đơn hàng cần thanh toán',
          example: 'clx1234567890abcdef',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Khởi tạo thành công',
    schema: {
      type: 'object',
      properties: {
        canPay: {
          type: 'boolean',
          description: 'Có thể thanh toán ngay hay phải chờ',
          example: true,
        },
        payment: {
          type: 'object',
          nullable: true,
          description: 'Thông tin payment (chỉ có khi canPay = true)',
          properties: {
            id: { type: 'string', example: 'pay_1234567890' },
            orderId: { type: 'string', example: 'clx1234567890abcdef' },
            amount: { type: 'number', example: 150000 },
            method: { type: 'string', example: 'BANK_TRANSFER' },
            status: { type: 'string', example: 'PENDING' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        queuePosition: {
          type: 'number',
          nullable: true,
          description: 'Vị trí trong hàng đợi (chỉ có khi canPay = false)',
          example: 3,
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Order không hợp lệ hoặc không thể thanh toán',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: {
          type: 'string',
          example: 'Order already processed',
        },
        error: { type: 'string', example: 'Bad Request' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Token không hợp lệ hoặc hết hạn',
  })
  @ApiResponse({
    status: 404,
    description: 'Not Found - Order không tồn tại',
  })
  async initiatePayment(
    @Body('orderId') orderId: string,
    @CurrentUser() user: AuthenticatedUser,
    @GetLanguage() lang: string,
  ) {
    return this.paymentsService.initiatePayment(orderId, user.id, lang);
  }

  @Get('status/:orderId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Lấy trạng thái thanh toán và thông tin hàng đợi',
    description: `
      Endpoint này cung cấp thông tin chi tiết về:
      - Trạng thái payment hiện tại
      - Vị trí trong hàng đợi (nếu đang chờ)
      - Thông tin session (nếu đang active)
    `,
  })
  @ApiParam({
    name: 'orderId',
    description: 'ID của đơn hàng',
    type: 'string',
    example: 'clx1234567890abcdef',
  })
  @ApiResponse({
    status: 200,
    description: 'Lấy thông tin thành công',
    schema: {
      type: 'object',
      properties: {
        payment: {
          type: 'object',
          nullable: true,
          description: 'Thông tin payment (null nếu chưa tạo)',
          properties: {
            id: { type: 'string' },
            orderId: { type: 'string' },
            amount: { type: 'number' },
            method: { type: 'string' },
            status: {
              type: 'string',
              enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
            },
            paidAt: { type: 'string', format: 'date-time', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        queue: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['ACTIVE', 'WAITING', 'NOT_FOUND'],
              description:
                'ACTIVE: Đang thanh toán | WAITING: Đang chờ | NOT_FOUND: Không trong queue',
            },
            position: {
              type: 'number',
              nullable: true,
              description:
                'Vị trí trong hàng đợi (1-indexed, null nếu ACTIVE hoặc NOT_FOUND)',
              example: 2,
            },
            total: {
              type: 'number',
              description: 'Tổng số người đang chờ',
              example: 5,
            },
          },
        },
        session: {
          type: 'object',
          nullable: true,
          description: 'Thông tin session (chỉ có khi status = ACTIVE)',
          properties: {
            userId: { type: 'string', example: 'usr_1234567890' },
            remainingSeconds: {
              type: 'number',
              description: 'Số giây còn lại của session',
              example: 240,
            },
            startedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Thời điểm bắt đầu session',
            },
            startedAtUnix: {
              type: 'number',
              description: 'Unix timestamp (ms) của thời điểm bắt đầu',
              example: 1702368000000,
            },
            expiresAtUnix: {
              type: 'number',
              description: 'Unix timestamp (ms) khi session hết hạn',
              example: 1702368300000,
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 404,
    description: 'Order không tồn tại',
  })
  async getPaymentStatus(
    @Param('orderId') orderId: string,
    @CurrentUser() user: AuthenticatedUser,
    @GetLanguage() lang: string,
  ) {
    return this.paymentsService.getPaymentStatus(orderId, user.id, lang);
  }

  @Get('qr/:orderId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Tạo mã QR thanh toán',
    description: `
      Generate VietQR code cho thanh toán chuyển khoản ngân hàng.
      
      **Điều kiện:**
      - Payment session phải đang ACTIVE (không được WAITING)
      - Payment record đã được tạo
      - Session chưa hết hạn
      
      **QR Code format:**
      - Sử dụng VietQR API (img.vietqr.io)
      - Bao gồm: bankCode, accountNo, amount, content
      - Content format: ORDER-YYYYMMDD-XXXX
      
      **Response:**
      - qrUrl: Link trực tiếp đến ảnh QR
      - qrBase64: QR code dạng base64 để hiển thị offline
      - Thông tin banking để hiển thị manual
      - remainingSeconds: Thời gian còn lại để thanh toán
    `,
  })
  @ApiParam({
    name: 'orderId',
    description: 'ID của đơn hàng',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'QR code được tạo thành công',
    schema: {
      type: 'object',
      properties: {
        qrUrl: {
          type: 'string',
          description: 'URL của ảnh QR code từ VietQR',
          example:
            'https://img.vietqr.io/image/970415-0123456789-compact2.jpg?amount=150000&addInfo=ORDER-20231212-0001',
        },
        qrBase64: {
          type: 'string',
          description: 'QR code dạng base64 data URL',
          example: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
        },
        bankCode: {
          type: 'string',
          description: 'Mã ngân hàng (VietQR bank code)',
          example: '970415',
        },
        accountNo: {
          type: 'string',
          description: 'Số tài khoản nhận tiền',
          example: '0123456789',
        },
        accountName: {
          type: 'string',
          description: 'Tên chủ tài khoản',
          example: 'NGUYEN VAN A',
        },
        amount: {
          type: 'number',
          description: 'Số tiền cần chuyển (VNĐ)',
          example: 150000,
        },
        content: {
          type: 'string',
          description:
            'Nội dung chuyển khoản (QUAN TRỌNG: User phải nhập chính xác)',
          example: 'ORDER-20231212-0001',
        },
        orderNumber: {
          type: 'string',
          description: 'Mã đơn hàng (giống content)',
          example: 'ORDER-20231212-0001',
        },
        remainingSeconds: {
          type: 'number',
          description: 'Số giây còn lại của payment session',
          example: 285,
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Session không active hoặc đã hết hạn',
  })
  @ApiResponse({
    status: 404,
    description: 'Order hoặc Payment không tồn tại',
  })
  async generateQRCode(
    @Param('orderId') orderId: string,
    @CurrentUser() user: AuthenticatedUser,
    @GetLanguage() lang: string,
  ) {
    return this.paymentsService.generateQRCode(orderId, user.id, lang);
  }

  @Post('cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Hủy thanh toán',
    description: `
      **Hành động khi cancel:**
      1. Remove khỏi queue/session
      2. Update payment status thành FAILED (nếu có)
      3. Metadata ghi nhận: cancelledBy = 'user', cancelledAt
      4. Process người tiếp theo trong queue (nếu có)
      5. Gửi notification cho người tiếp theo
      
      **Lưu ý:**
      - Không thể cancel payment đã COMPLETED
      - Không thể cancel payment đang PROCESSING
      - Cancel sẽ giải phóng slot cho người khác
    `,
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['orderId'],
      properties: {
        orderId: {
          type: 'string',
          description: 'ID của đơn hàng cần hủy',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Hủy thành công',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Order không tồn tại',
  })
  async cancelPayment(
    @Body('orderId') orderId: string,
    @CurrentUser() user: AuthenticatedUser,
    @GetLanguage() lang: string,
  ) {
    return this.paymentsService.cancelPayment(orderId, user.id, lang);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Webhook call - Xác nhận thanh toán',
    description: `
      Endpoint nhận callback từ webhook khi có giao dịch chuyển khoản thành công.
      
      **Security:**
      - Verify HMAC-SHA256 signature với secret key
      - Reject request nếu signature không khớp
      
      **Luồng xử lý:**
      1. Verify signature
      2. Extract order number từ content
      3. Validate amount khớp với order
      4. Update payment status → COMPLETED
      5. Update order status → PAID
      6. Complete payment session
      7. Notify user via WebSocket
      8. Process next in queue
      
      **Webhook request format:**
      - POST request với JSON body
      - Header: x-signature (HMAC-SHA256)
      - Body chứa: transferAmount, content, when, ...
    `,
  })
  @ApiHeader({
    name: 'x-signature',
    description: 'HMAC-SHA256 signature để verify webhook từ Sepay',
    required: true,
    schema: {
      type: 'string',
      example: 'a3f5b8c9d2e1f4a7b6c5d8e9f2a1b4c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2',
    },
  })
  @ApiBody({
    description: 'Webhook payload từ Sepay',
    schema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'Transaction ID từ Sepay',
          example: 123456789,
        },
        gateway: {
          type: 'string',
          description: 'Tên ngân hàng',
          example: 'Vietcombank',
        },
        transactionNumber: {
          type: 'string',
          description: 'Mã giao dịch ngân hàng',
          example: 'FT23121212345678',
        },
        referenceNumber: {
          type: 'string',
          description: 'Mã tham chiếu',
          example: 'REF123456',
        },
        accountNumber: {
          type: 'string',
          description: 'Số tài khoản nhận',
          example: '0123456789',
        },
        transferType: {
          type: 'string',
          example: 'IN',
        },
        transferAmount: {
          type: 'number',
          description: 'Số tiền chuyển (VNĐ)',
          example: 150000,
        },
        content: {
          type: 'string',
          description: 'Nội dung chuyển khoản (chứa order number)',
          example: 'ORDER-20231212-0001',
        },
        when: {
          type: 'string',
          format: 'date-time',
          description: 'Thời gian giao dịch',
          example: '2023-12-12T14:30:00.000Z',
        },
        bankBrandName: {
          type: 'string',
          example: 'Vietcombank',
        },
        bankAccountNumber: {
          type: 'string',
          example: '0123456789',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook processed (cả success lẫn fail đều return 200)',
    schema: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          example: true,
        },
        message: {
          type: 'string',
          example: 'Payment confirmed',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid signature',
  })
  async handleWebhook(
    @Body() body: any,
    @Headers('x-signature') signature: string,
  ) {
    return this.paymentsService.handleWebhook(body, signature);
  }

  @Post('verify/:paymentId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions(Permission.PAYMENT_VERIFY)
  @ApiBearerAuth('JWT')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Xác nhận thanh toán thủ công (Admin)',
    description: `
      Admin endpoint để verify payment thủ công
      1. Update payment status → COMPLETED
      2. Update order status → PAID
      3. Set paidAt = now
      4. Add metadata: manualVerification = true
      5. Complete session và process next
      6. Notify user
      
      **Permission required:** PAYMENT_VERIFY
    `,
  })
  @ApiParam({
    name: 'paymentId',
    description: 'ID của payment cần verify',
    type: 'string',
    example: 'pay_1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment verified successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        orderId: { type: 'string' },
        amount: { type: 'number' },
        status: { type: 'string', example: 'COMPLETED' },
        paidAt: { type: 'string', format: 'date-time' },
        metadata: {
          type: 'object',
          properties: {
            manualVerification: { type: 'boolean', example: true },
            verifiedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Payment đã được verify trước đó',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Không có quyền PAYMENT_VERIFY',
  })
  @ApiResponse({
    status: 404,
    description: 'Payment không tồn tại',
  })
  async verifyPayment(
    @Param('paymentId') paymentId: string,
    @GetLanguage() lang: string,
  ) {
    return this.paymentsService.verifyPayment(paymentId, lang);
  }

  @Post('clear-queue')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions(Permission.PAYMENT_QUEUE_CLEAR)
  @ApiBearerAuth('JWT')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Xóa toàn bộ hàng đợi thanh toán (Admin)',
    description: `
      Endpoint nguy hiểm - Xóa tất cả queue và session trong Redis.
      
      **Use cases:**
      - System maintenance
      - Reset khi có bug critical
      - Testing/debugging
      
      **Permission required:** PAYMENT_QUEUE_CLEAR
    `,
  })
  @ApiResponse({
    status: 200,
    description: 'Queue cleared successfully',
    schema: {
      type: 'object',
      properties: {
        activeSessionsCleared: {
          type: 'number',
          description: 'Số active sessions đã xóa',
          example: 2,
        },
        waitingQueueCleared: {
          type: 'number',
          description: 'Số orders đang chờ đã xóa',
          example: 5,
        },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Không có quyền PAYMENT_QUEUE_CLEAR',
  })
  async clearQueue() {
    return this.paymentsService.clearQueue();
  }
}
