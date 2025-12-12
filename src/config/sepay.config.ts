import { registerAs } from '@nestjs/config';

export default registerAs('sepay', () => ({
  apiUrl: process.env.SEPAY_API_URL || 'https://my.sepay.vn/userapi',
  apiKey: process.env.SEPAY_API_KEY,
  accountNumber: process.env.SEPAY_ACCOUNT_NUMBER,
  accountName: process.env.SEPAY_ACCOUNT_NAME,
  bankCode: process.env.SEPAY_BANK_CODE || 'MB',
  webhookSecret: process.env.SEPAY_WEBHOOK_SECRET,
}));
