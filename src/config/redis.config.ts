import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB ?? '0', 10),
  ttl: {
    voucher: parseInt(process.env.VOUCHER_RESERVE_TTL ?? '900', 10),
    stock: parseInt(process.env.STOCK_RESERVE_TTL ?? '900', 10),
    order: parseInt(process.env.ORDER_EXPIRY_MINUTES ?? '15', 10) * 60,
  },
}));
