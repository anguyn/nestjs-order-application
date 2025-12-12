import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT ?? '3005', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  appUrl: process.env.APP_URL || 'http://localhost:3005',
  apiPrefix: process.env.API_PREFIX || 'api',
  apiVersion: process.env.API_VERSION || 'v1',
  apiUrl: `${process.env.APP_URL || 'http://localhost:3005'}/${process.env.API_PREFIX || 'api'}/${process.env.API_VERSION || 'v1'}`,
}));
