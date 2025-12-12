// src/config/jwt.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_ACCESS_SECRET || 'secret',
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'refresh-secret',
  accessTokenExpiry: process.env.ACCESS_TOKEN_EXPIRY || '15m',
  refreshTokenExpiry: process.env.REFRESH_TOKEN_EXPIRY || '7d',
  autoRefresh: process.env.JWT_AUTO_REFRESH === 'true',

  refreshTokenExpiryDays: parseInt(
    process.env.REFRESH_TOKEN_EXPIRY_DAYS || '7',
    10,
  ),
  refreshTokenExpiryDaysRememberMe: parseInt(
    process.env.REFRESH_TOKEN_EXPIRY_DAYS_REMEMBER_ME || '30',
    10,
  ),

  emailVerifyTokenExpiryHours: parseInt(
    process.env.EMAIL_VERIFY_TOKEN_EXPIRY_HOURS || '24',
    10,
  ),

  resetPasswordTokenExpiryHours: parseInt(
    process.env.RESET_PASSWORD_TOKEN_EXPIRY_HOURS || '1',
    10,
  ),
}));
