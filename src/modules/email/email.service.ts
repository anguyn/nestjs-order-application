import { Injectable, Logger, Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Resend } from 'resend';
import { PrismaService } from '@database/prisma.service';
import { Language } from '@generated/prisma/client';
import appConfig from '@config/app.config';
import emailConfig from '@config/email.config';
import {
  welcomeEmailTemplate,
  verificationEmailTemplate,
  passwordResetTemplate,
  orderConfirmationTemplate,
  paymentConfirmedTemplate,
} from './templates/email.templates';

export interface SendEmailDto {
  to: string;
  subject: string;
  html: string;
  template?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;

  constructor(
    @Inject(appConfig.KEY)
    private readonly app: ConfigType<typeof appConfig>,
    @Inject(emailConfig.KEY)
    private readonly email: ConfigType<typeof emailConfig>,
    private readonly prisma: PrismaService,
  ) {
    const apiKey = this.email.resend.apiKey;

    if (!apiKey) {
      this.logger.warn(
        'RESEND_API_KEY not configured. Emails will not be sent.',
      );
    }

    this.resend = new Resend(apiKey);
  }

  async sendEmail(dto: SendEmailDto): Promise<void> {
    try {
      const html = dto.html
        .replace(/{{APP_URL}}/g, this.app.frontendUrl)
        .replace(/{{API_URL}}/g, this.app.apiUrl);

      const { data, error } = await this.resend.emails.send({
        from: `${this.email.resend.fromName} <${this.email.resend.fromEmail}>`,
        to: dto.to,
        subject: dto.subject,
        html,
      });

      if (error) {
        this.logger.error(`Failed to send email to ${dto.to}:`, error);
        throw error;
      }

      this.logger.log(`Email sent successfully to ${dto.to} (ID: ${data?.id})`);
    } catch (error) {
      this.logger.error(`Email sending error:`, error);
      throw error;
    }
  }

  async sendWelcomeEmail(
    email: string,
    firstName: string,
    lastName: string,
    lang: Language = Language.EN,
  ): Promise<void> {
    const subject =
      lang === Language.VI
        ? `Chào mừng ${firstName} ${lastName} đến với E-commerce Store!`
        : `Welcome ${firstName} ${lastName} to E-commerce Store!`;

    const html = welcomeEmailTemplate(firstName, lastName, lang);

    await this.sendEmail({
      to: email,
      subject,
      html,
      template: 'welcome',
    });
  }

  async sendVerificationEmail(
    email: string,
    firstName: string,
    lastName: string,
    token: string,
    lang: Language = Language.EN,
  ): Promise<void> {
    const verifyUrl = `${this.app.frontendUrl}/verify-email?token=${token}`;

    const subject =
      lang === Language.VI
        ? 'Xác nhận địa chỉ email của bạn'
        : 'Verify Your Email Address';

    const html = verificationEmailTemplate(
      firstName,
      lastName,
      token,
      verifyUrl,
      lang,
    );

    await this.sendEmail({
      to: email,
      subject,
      html,
      template: 'verify-email',
    });
  }

  async sendPasswordResetEmail(
    email: string,
    firstName: string,
    lastName: string,
    token: string,
    lang: Language = Language.EN,
  ): Promise<void> {
    const resetUrl = `${this.app.frontendUrl}/reset-password?token=${token}`;

    const subject =
      lang === Language.VI ? 'Đặt lại mật khẩu của bạn' : 'Reset Your Password';

    const html = passwordResetTemplate(
      firstName,
      lastName,
      token,
      resetUrl,
      lang,
    );

    await this.sendEmail({
      to: email,
      subject,
      html,
      template: 'reset-password',
    });
  }

  async sendOrderConfirmationEmail(
    email: string,
    orderNumber: string,
    totalAmount: number,
    lang: Language = Language.EN,
  ): Promise<void> {
    const subject =
      lang === Language.VI
        ? `Xác nhận đơn hàng #${orderNumber}`
        : `Order Confirmation #${orderNumber}`;

    const html = orderConfirmationTemplate(orderNumber, totalAmount, lang);

    await this.sendEmail({
      to: email,
      subject,
      html,
      template: 'order-confirmation',
    });
  }

  async sendPaymentConfirmedEmail(
    email: string,
    orderNumber: string,
    totalAmount: number,
    lang: Language = Language.EN,
  ): Promise<void> {
    const subject =
      lang === Language.VI
        ? `Thanh toán thành công #${orderNumber}`
        : `Payment Confirmed #${orderNumber}`;

    const html = paymentConfirmedTemplate(orderNumber, totalAmount, lang);

    await this.sendEmail({
      to: email,
      subject,
      html,
      template: 'payment-confirmed',
    });
  }
}
