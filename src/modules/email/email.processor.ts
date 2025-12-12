import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { EmailService } from './email.service';
import { Language } from '@generated/prisma/client';

export interface WelcomeEmailJob {
  email: string;
  firstName: string;
  lastName: string;
  language?: Language;
}

export interface VerificationEmailJob {
  email: string;
  firstName: string;
  lastName: string;
  token: string;
  language?: Language;
}

export interface PasswordResetEmailJob {
  email: string;
  firstName: string;
  lastName: string;
  token: string;
  language?: Language;
}

export interface OrderConfirmationEmailJob {
  email: string;
  orderNumber: string;
  totalAmount: number;
  language?: Language;
}

export interface PaymentConfirmedEmailJob {
  email: string;
  orderNumber: string;
  totalAmount: number;
  language?: Language;
}

@Processor('email')
export class EmailProcessor {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly emailService: EmailService) {}

  @Process('send-welcome')
  async handleWelcomeEmail(job: Job<WelcomeEmailJob>) {
    this.logger.log(`Processing welcome email for ${job.data.email}`);
    try {
      await this.emailService.sendWelcomeEmail(
        job.data.email,
        job.data.firstName,
        job.data.lastName,
        job.data.language || Language.EN,
      );
      this.logger.log(`Welcome email sent to ${job.data.email}`);
    } catch (error) {
      this.logger.error(`Failed to send welcome email:`, error);
      throw error;
    }
  }

  @Process('send-verification')
  async handleVerificationEmail(job: Job<VerificationEmailJob>) {
    this.logger.log(`Processing verification email for ${job.data.email}`);
    try {
      await this.emailService.sendVerificationEmail(
        job.data.email,
        job.data.firstName,
        job.data.lastName,
        job.data.token,
        job.data.language || Language.EN,
      );
      this.logger.log(`Verification email sent to ${job.data.email}`);
    } catch (error) {
      this.logger.error(`Failed to send verification email:`, error);
      throw error;
    }
  }

  @Process('send-password-reset')
  async handlePasswordResetEmail(job: Job<PasswordResetEmailJob>) {
    this.logger.log(`Processing password reset email for ${job.data.email}`);
    try {
      await this.emailService.sendPasswordResetEmail(
        job.data.email,
        job.data.firstName,
        job.data.lastName,
        job.data.token,
        job.data.language || Language.EN,
      );
      this.logger.log(`Password reset email sent to ${job.data.email}`);
    } catch (error) {
      this.logger.error(`Failed to send password reset email:`, error);
      throw error;
    }
  }

  @Process('send-order-confirmation')
  async handleOrderConfirmationEmail(job: Job<OrderConfirmationEmailJob>) {
    this.logger.log(
      `Processing order confirmation email for ${job.data.email}`,
    );
    try {
      await this.emailService.sendOrderConfirmationEmail(
        job.data.email,
        job.data.orderNumber,
        job.data.totalAmount,
        job.data.language || Language.EN,
      );
      this.logger.log(`Order confirmation email sent to ${job.data.email}`);
    } catch (error) {
      this.logger.error(`Failed to send order confirmation email:`, error);
      throw error;
    }
  }

  @Process('send-payment-confirmed')
  async handlePaymentConfirmedEmail(job: Job<PaymentConfirmedEmailJob>) {
    this.logger.log(`Processing payment confirmed email for ${job.data.email}`);
    try {
      await this.emailService.sendPaymentConfirmedEmail(
        job.data.email,
        job.data.orderNumber,
        job.data.totalAmount,
        job.data.language || Language.EN,
      );
      this.logger.log(`Payment confirmed email sent to ${job.data.email}`);
    } catch (error) {
      this.logger.error(`Failed to send payment confirmed email:`, error);
      throw error;
    }
  }
}
