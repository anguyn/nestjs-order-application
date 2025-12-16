import {
  Processor,
  Process,
  OnQueueFailed,
  OnQueueCompleted,
} from '@nestjs/bull';
import { Inject } from '@nestjs/common';
import type { Job } from 'bull';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
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
  constructor(
    private readonly emailService: EmailService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  @Process('send-welcome')
  async handleWelcomeEmail(job: Job<WelcomeEmailJob>) {
    this.logger.info('Processing welcome email', {
      service: 'job',
      jobId: job.id,
      email: job.data.email,
      attempt: job.attemptsMade + 1,
    });

    try {
      await this.emailService.sendWelcomeEmail(
        job.data.email,
        job.data.firstName,
        job.data.lastName,
        job.data.language || Language.EN,
      );

      this.logger.info('Welcome email sent successfully', {
        service: 'job',
        jobId: job.id,
        email: job.data.email,
      });
    } catch (error) {
      this.logger.error('Failed to send welcome email', {
        service: 'job',
        jobId: job.id,
        email: job.data.email,
        attempt: job.attemptsMade + 1,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  @Process('send-verification')
  async handleVerificationEmail(job: Job<VerificationEmailJob>) {
    this.logger.info('Processing verification email', {
      service: 'job',
      jobId: job.id,
      email: job.data.email,
    });

    try {
      await this.emailService.sendVerificationEmail(
        job.data.email,
        job.data.firstName,
        job.data.lastName,
        job.data.token,
        job.data.language || Language.EN,
      );
    } catch (error) {
      this.logger.error('Failed to send verification email', {
        service: 'job',
        jobId: job.id,
        email: job.data.email,
        error: error.message,
      });
      throw error;
    }
  }

  @Process('send-order-confirmation')
  async handleOrderConfirmationEmail(job: Job<OrderConfirmationEmailJob>) {
    this.logger.info('Processing order confirmation email', {
      service: 'job',
      jobId: job.id,
      email: job.data.email,
      orderNumber: job.data.orderNumber,
    });

    try {
      await this.emailService.sendOrderConfirmationEmail(
        job.data.email,
        job.data.orderNumber,
        job.data.totalAmount,
        job.data.language || Language.EN,
      );
    } catch (error) {
      this.logger.error('Failed to send order confirmation email', {
        service: 'job',
        jobId: job.id,
        email: job.data.email,
        orderNumber: job.data.orderNumber,
        error: error.message,
      });
      throw error;
    }
  }

  @Process('send-payment-confirmed')
  async handlePaymentConfirmedEmail(job: Job<PaymentConfirmedEmailJob>) {
    this.logger.info('Processing payment confirmed email', {
      service: 'job',
      jobId: job.id,
      email: job.data.email,
      orderNumber: job.data.orderNumber,
    });

    try {
      await this.emailService.sendPaymentConfirmedEmail(
        job.data.email,
        job.data.orderNumber,
        job.data.totalAmount,
        job.data.language || Language.EN,
      );
    } catch (error) {
      this.logger.error('Failed to send payment confirmed email', {
        service: 'job',
        jobId: job.id,
        email: job.data.email,
        orderNumber: job.data.orderNumber,
        error: error.message,
      });
      throw error;
    }
  }

  @OnQueueCompleted()
  onCompleted(job: Job) {
    this.logger.info('Job completed successfully', {
      service: 'job',
      queue: 'email',
      jobId: job.id,
      jobName: job.name,
      attempts: job.attemptsMade,
      duration:
        job.finishedOn && job.processedOn
          ? job.finishedOn - job.processedOn
          : null,
    });
  }
}
