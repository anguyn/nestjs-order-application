import { registerAs } from '@nestjs/config';
import * as path from 'path';

export default registerAs('i18n', () => ({
  fallbackLanguage: process.env.FALLBACK_LANGUAGE || 'en',
  loaderOptions: {
    path: path.join(__dirname, '../i18n/'),
    watch: true,
  },
}));
