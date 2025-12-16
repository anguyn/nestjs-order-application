import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { HttpExceptionFilter } from '@shared/filters/http-exception.filter';
import { TransformInterceptor } from '@shared/interceptors/transform.interceptor';

async function bootstrap() {
  const port = process.env.PORT || 3000;

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(cookieParser.default());

  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  app.useGlobalInterceptors(new TransformInterceptor());

  // ==========================================
  // OpenAPI Specification
  // ==========================================
  const config = new DocumentBuilder()
    .setTitle('E-commerce API')
    .setDescription(
      `
# E-commerce API with Advanced Voucher System

A production-ready e-commerce API built with NestJS, featuring advanced voucher management, payment processing, and real-time notifications.

## 🎯 Key Features

### Authentication & Security
- JWT-based authentication with refresh tokens
- Email verification & password reset
- Role-based access control (RBAC)
- Granular permissions system
- Multi-device session management

### Product Management
- Full CRUD operations
- Edit locking to prevent concurrent modifications
- Stock management with real-time updates
- Image upload support
- SEO-friendly slug generation

### Shopping Experience
- Persistent shopping cart
- Real-time stock validation
- Multiple voucher support per order
- 15-minute order expiry

### Voucher System
**Three Voucher Types:**
- **SINGLE_USE**: One-time use per voucher
- **MULTI_USE**: Limited number of uses (configurable)
- **USER_SPECIFIC**: Exclusive vouchers for specific users

**Two Discount Types:**
- **FIXED**: Fixed amount discount (e.g., $50 off)
- **PERCENTAGE**: Percentage-based discount (e.g., 10% off)

**Advanced Features:**
- Minimum order amount requirements
- Maximum discount caps
- Expiration dates
- Event-based voucher issuance
- Atomic usage tracking

### Payment Processing
- **VietQR**: QR code generation for bank transfers
- **Sepay**: Payment gateway integration
- Queue-based processing (max 5 concurrent)
- Webhook support for real-time updates
- Transaction history

### Communication
- **Email**: 5 templates (welcome, verification, reset, order, payment)
- **WebSocket**: Real-time notifications for order updates
- Bull Queue for reliable message delivery

### Maintenance
- Automatic cleanup of expired data
- Database health monitoring
- Edit lock expiration
- Order expiry handling

## 🚀 Quick Start

### 1. Register New User
\`\`\`bash
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe"
}
\`\`\`

### 2. Verify Email
Check your email and click verification link, or use:
\`\`\`bash
GET /api/auth/verify-email?token={verification_token}
\`\`\`

### 3. Login
\`\`\`bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
\`\`\`

Response includes \`accessToken\` and \`refreshToken\`.

### 4. Authenticate Requests
Add token to all authenticated requests:
\`\`\`
Authorization: Bearer {accessToken}
\`\`\`

## 📦 Complete Order Workflow

### Step 1: Browse & Add to Cart
\`\`\`bash
# Get products
GET /api/products

# Add to cart
POST /api/cart/items
{
  "productId": "product-id",
  "quantity": 2
}
\`\`\`

### Step 2: Get Voucher
\`\`\`bash
# Browse events
GET /api/events

# Issue voucher from event
POST /api/vouchers/issue
{
  "eventId": "event-id"
}

# Validate voucher (optional)
POST /api/vouchers/validate
{
  "code": "VOUCHER-CODE",
  "orderAmount": 100000
}
\`\`\`

### Step 3: Create Order
\`\`\`bash
POST /api/orders
{
  "addressId": "address-id",
  "voucherCodes": ["VOUCHER-CODE"],
  "customerNote": "Please deliver before 5 PM"
}
\`\`\`

### Step 4: Process Payment
\`\`\`bash
# Create payment (queued)
POST /api/payments/create
{
  "orderId": "order-id",
  "method": "VIETQR"  # or "SEPAY"
}

# Get payment details (QR code or gateway URL)
GET /api/payments/order/{orderId}
\`\`\`

### Step 5: Track Order
\`\`\`bash
# Get order status
GET /api/orders/{orderId}

# WebSocket for real-time updates
ws://localhost:${port}/notifications
\`\`\`

## 🔌 WebSocket Integration

### Connect
\`\`\`javascript
import { io } from 'socket.io-client';

const socket = io('ws://localhost:${port}/notifications', {
  auth: { token: 'your-jwt-token' }
});

socket.on('connected', (data) => {
  console.log('Connected:', data);
});
\`\`\`

### Available Events
- \`order:status-updated\` - Order status changed
- \`payment:confirmed\` - Payment successful
- \`voucher:issued\` - New voucher received
- \`cart:updated\` - Cart modified
- \`product:stock-low\` - Low stock alert (admin)
- \`order:new\` - New order placed (admin)

## 🔐 Permissions System

Users are assigned roles and granular permissions:

**Roles:**
- \`USER\` - Regular customer
- \`MERCHANT\` - Seller/vendor
- \`ADMIN\` - System administrator

**Permission Examples:**
- \`USER_READ\`, \`USER_CREATE\`, \`USER_UPDATE\`, \`USER_DELETE\`
- \`PRODUCT_READ\`, \`PRODUCT_CREATE\`, \`PRODUCT_UPDATE\`, \`PRODUCT_DELETE\`
- \`ORDER_READ\`, \`ORDER_CREATE\`, \`ORDER_UPDATE\`
- \`VOUCHER_READ\`, \`VOUCHER_ISSUE\`, \`VOUCHER_USE\`, \`VOUCHER_CREATE\`
- \`EVENT_READ\`, \`EVENT_CREATE\`, \`EVENT_UPDATE\`, \`EVENT_DELETE\`

## 🌐 Internationalization (i18n)

Set language preference via:
- Query parameter: \`?lang=vi\`
- Header: \`Accept-Language: vi\`
- Header: \`x-language: vi\`
- User profile setting

**Supported languages:** English (\`en\`), Vietnamese (\`vi\`)

## ⚠️ Error Handling

All errors follow a consistent format:
\`\`\`json
{
  "statusCode": 400,
  "message": "Localized error message",
  "error": "Bad Request",
  "timestamp": "2024-12-08T15:30:00.000Z",
  "path": "/api/endpoint"
}
\`\`\`

Common status codes:
- \`200\` - Success
- \`201\` - Created
- \`400\` - Bad Request
- \`401\` - Unauthorized
- \`403\` - Forbidden
- \`404\` - Not Found
- \`409\` - Conflict
- \`500\` - Internal Server Error

## 🚦 Rate Limiting

Default limits:
- 100 requests per minute per IP
- Configurable via environment variables

## 📊 Order Status Flow

\`\`\`
PENDING → PROCESSING → PAID → CONFIRMED → SHIPPING → DELIVERED
                           ↓
                      CANCELLED / REFUNDED / EXPIRED
\`\`\`

## 💳 Payment Methods

### VietQR
- QR code for bank transfer
- Real-time verification
- No transaction fees

### Sepay
- Payment gateway
- Card payments
- E-wallet support

## 🛠️ Technical Stack

- **Framework**: NestJS 11.x
- **Database**: PostgreSQL (via Prisma ORM)
- **Cache/Queue**: Redis + Bull
- **Email**: Resend API
- **WebSocket**: Socket.IO
- **Documentation**: Swagger + Scalar
- **Authentication**: JWT (Passport.js)

## 📝 Additional Resources

- [GitHub Repository](https://github.com/yourusername/nestjs-ecommerce)
- [Postman Collection](https://www.postman.com/your-collection)
- [Status Page](https://status.yourdomain.com)
    `,
    )
    .setVersion('1.0.0')
    .setContact(
      'API Support',
      'https://github.com/yourusername/nestjs-ecommerce',
      'support@yourdomain.com',
    )
    .setLicense('MIT License', 'https://opensource.org/licenses/MIT')
    .addServer(`http://localhost:${port}`, 'Local Development')
    .addServer('https://api-staging.yourdomain.com', 'Staging Environment')
    .addServer('https://api.yourdomain.com', 'Production')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter JWT access token (obtain from /api/auth/login)',
        in: 'header',
      },
      'JWT',
    )
    .addTag('Auth', 'Authentication & authorization')
    .addTag('Users', 'User management & profiles')
    .addTag('Products', 'Product catalog management')
    .addTag('Cart', 'Shopping cart operations')
    .addTag('Events', 'Event management for vouchers')
    .addTag('Vouchers', 'Voucher issuance & redemption')
    .addTag('Orders', 'Order processing & tracking')
    .addTag('Payments', 'Payment processing & webhooks')
    .addTag('Health', 'Health check & monitoring')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      showRequestDuration: true,
      syntaxHighlight: {
        activate: true,
      },
      tryItOutEnabled: true,
      displayRequestDuration: true,
      deepLinking: true,
    },
    customSiteTitle: 'E-commerce API - Swagger Documentation',
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .info .title { 
        font-size: 2.5em; 
        font-weight: bold;
      }
      .swagger-ui .info .description { 
        font-size: 1.1em; 
      }
      .swagger-ui .scheme-container {
        background: #fafafa;
        padding: 15px;
        border-radius: 4px;
      }
    `,
  });

  const scalarHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>E-commerce API Documentation</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="Complete E-commerce API with Voucher System, Payment Processing, and Real-time Notifications" />
    <style>
      body { 
        margin: 0; 
        padding: 0; 
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      }
    </style>
</head>
<body>
    <script
      id="api-reference"
      data-url="/api/docs-json"
      data-configuration='${JSON.stringify({
        theme: 'purple',
        layout: 'modern',
        darkMode: true,
        showSidebar: true,
        hideModels: false,
        hideDownloadButton: false,
        searchHotKey: 'k',
        customCss: `
          .scalar-card { border-radius: 8px; }
          .scalar-button { border-radius: 6px; }
        `,
      })}'
    ></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>
  `;

  app.getHttpAdapter().get('/api', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(scalarHtml);
  });

  app.getHttpAdapter().get('/api/docs-json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(document);
  });

  app.getHttpAdapter().get('/api/docs-yaml', async (req, res) => {
    const yaml = await import('js-yaml');
    res.setHeader('Content-Type', 'text/yaml');
    res.send(yaml.dump(document));
  });

  await app.listen(port);

  console.log(`
  ║   🌐 API Root:    http://localhost:${port}/api             
  ║   📘 Scalar UI:   http://localhost:${port}/api                   
  ║   📚 Swagger UI:  http://localhost:${port}/api/docs              
  ║   📄 OpenAPI:     http://localhost:${port}/api/docs-json          
  ║   📝 YAML:        http://localhost:${port}/api/docs-yaml  
  ║   🔌 WebSocket:   ws://localhost:${port}/notification
  ║   ❤️  Health:      http://localhost:${port}/api/health            
  Environment: ${(process.env.NODE_ENV || 'development').padEnd(12)} 

  💡 Documentation Options:
  │ 📘 Scalar (Modern):   http://localhost:${port}/api
  │ 📚 Swagger (Classic): http://localhost:${port}/api/docs    

  🎯 Quick Links:
  - Register:  POST http://localhost:${port}/api/auth/register
  - Login:     POST http://localhost:${port}/api/auth/login
  - Products:  GET  http://localhost:${port}/api/products
  - Health:    GET  http://localhost:${port}/api/health

  Press Ctrl+C to stop the server
  `);
}

bootstrap();
