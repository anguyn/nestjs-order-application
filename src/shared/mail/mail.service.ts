// NOT USE YET
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get('SMTP_HOST'),
      port: this.configService.get('SMTP_PORT'),
      secure: false,
      auth: {
        user: this.configService.get('SMTP_USER'),
        pass: this.configService.get('SMTP_PASSWORD'),
      },
    });
  }

  async sendWelcomeEmail(to: string, firstName: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.configService.get('EMAIL_FROM'),
      to,
      subject: 'Welcome to Our Platform',
      html: `
        <h1>Welcome, ${firstName}!</h1>
        <p>Thank you for registering with us.</p>
      `,
    });
  }

  async sendOrderConfirmation(
    to: string,
    orderNumber: string,
    total: number,
    qrCode?: string,
  ): Promise<void> {
    await this.transporter.sendMail({
      from: this.configService.get('EMAIL_FROM'),
      to,
      subject: `Order Confirmation - ${orderNumber}`,
      html: `
        <h1>Order Confirmed</h1>
        <p>Order Number: <strong>${orderNumber}</strong></p>
        <p>Total: <strong>${total.toLocaleString('vi-VN')} VND</strong></p>
        ${qrCode ? `<p>Scan QR code to pay:</p><img src="${qrCode}" alt="QR Code" />` : ''}
        <p>Please complete payment within 15 minutes.</p>
      `,
    });
  }

  async sendOrderExpired(to: string, orderNumber: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.configService.get('EMAIL_FROM'),
      to,
      subject: `Order Expired - ${orderNumber}`,
      html: `
        <h1>Order Expired</h1>
        <p>Your order <strong>${orderNumber}</strong> has expired due to timeout.</p>
        <p>Please create a new order if you still want to purchase.</p>
      `,
    });
  }

  async sendVoucherIssued(
    to: string,
    voucherCode: string,
    voucherName: string,
  ): Promise<void> {
    await this.transporter.sendMail({
      from: this.configService.get('EMAIL_FROM'),
      to,
      subject: `New Voucher: ${voucherName}`,
      html: `
        <h1>You've received a voucher!</h1>
        <p>Voucher Code: <strong>${voucherCode}</strong></p>
        <p>Name: ${voucherName}</p>
        <p>Use this code during checkout to get your discount.</p>
      `,
    });
  }
}
