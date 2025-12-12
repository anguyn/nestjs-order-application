// import { registerAs } from '@nestjs/config';

// export default registerAs('mail', () => ({
//   host: process.env.SMTP_HOST,
//   port: parseInt(process.env.SMTP_PORT ?? '587', 10),
//   secure: process.env.SMTP_SECURE === 'true',
//   auth: {
//     user: process.env.SMTP_USER,
//     pass: process.env.SMTP_PASSWORD,
//   },
//   from: process.env.EMAIL_FROM || 'noreply@example.com',
// }));

import { registerAs } from '@nestjs/config';

export interface EmailConfig {
  resend: {
    apiKey: string;
    fromEmail: string;
    fromName: string;
  };
}

export default registerAs(
  'email',
  (): EmailConfig => ({
    resend: {
      apiKey: process.env.RESEND_API_KEY || '',
      fromEmail: process.env.FROM_EMAIL || 'noreply@example.com',
      fromName: process.env.FROM_NAME || 'E-commerce Store',
    },
  }),
);
