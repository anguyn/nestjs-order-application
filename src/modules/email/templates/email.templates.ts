import { Language } from '@generated/prisma/client';

// ==========================================
// BASE LAYOUT
// ==========================================
const baseLayout = (content: string, lang: Language): string => {
  const footer =
    lang === Language.VI
      ? {
          automated: 'Email tự động, vui lòng không trả lời.',
          rights: '© E-commerce Store. Đã đăng ký bản quyền.',
        }
      : {
          automated: 'This is an automated email. Please do not reply.',
          rights: '© E-commerce Store. All rights reserved.',
        };

  return `
<!DOCTYPE html>
<html lang="${lang === Language.VI ? 'vi' : 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>E-commerce Store</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      background-color: #fafafa;
      line-height: 1.7;
      color: #1a1a1a;
    }
    .container {
      max-width: 580px;
      margin: 40px auto;
      background-color: #ffffff;
      border: 1px solid #e5e5e5;
    }
    .header {
      padding: 40px 40px 32px;
      border-bottom: 1px solid #e5e5e5;
    }
    .logo {
      font-size: 20px;
      font-weight: 600;
      color: #000000;
      letter-spacing: -0.5px;
      margin: 0;
    }
    .content {
      padding: 40px;
      color: #1a1a1a;
    }
    .content h2 {
      margin: 0 0 24px 0;
      font-size: 24px;
      font-weight: 600;
      color: #000000;
      letter-spacing: -0.5px;
      line-height: 1.3;
    }
    .content p {
      margin: 0 0 16px 0;
      font-size: 15px;
      color: #525252;
    }
    .button {
      display: inline-block;
      padding: 12px 28px;
      margin: 24px 0;
      background-color: #000000;
      color: #ffffff !important;
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.2px;
      border-radius: 4px;
      transition: background-color 0.2s;
    }
    .button:hover {
      background-color: #262626;
    }
    .info-box {
      background-color: #fafafa;
      border: 1px solid #e5e5e5;
      padding: 20px;
      margin: 24px 0;
      border-radius: 4px;
    }
    .info-box p {
      margin: 8px 0;
      font-size: 14px;
      color: #525252;
    }
    .info-box p:first-child {
      margin-top: 0;
    }
    .info-box p:last-child {
      margin-bottom: 0;
    }
    .code-box {
      background-color: #fafafa;
      border: 1px solid #e5e5e5;
      padding: 24px;
      margin: 24px 0;
      text-align: center;
      border-radius: 4px;
    }
    .code-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #737373;
      margin: 0 0 12px 0;
      font-weight: 500;
    }
    .code {
      font-size: 28px;
      font-weight: 600;
      color: #000000;
      letter-spacing: 2px;
      font-family: 'SF Mono', Monaco, 'Courier New', monospace;
      margin: 0;
    }
    .divider {
      height: 1px;
      background-color: #e5e5e5;
      margin: 32px 0;
    }
    .footer {
      background-color: #fafafa;
      padding: 32px 40px;
      border-top: 1px solid #e5e5e5;
      text-align: center;
    }
    .footer p {
      margin: 6px 0;
      color: #737373;
      font-size: 13px;
    }
    .highlight {
      color: #000000;
      font-weight: 500;
    }
    .warning-box {
      background-color: #fffbeb;
      border: 1px solid #fde68a;
      padding: 16px;
      margin: 24px 0;
      border-radius: 4px;
    }
    .warning-box p {
      margin: 0;
      font-size: 13px;
      color: #78350f;
    }
    .success-box {
      background-color: #f0fdf4;
      border: 1px solid #bbf7d0;
      padding: 20px;
      margin: 24px 0;
      border-radius: 4px;
    }
    .success-box p {
      margin: 0;
      font-size: 15px;
      color: #166534;
      font-weight: 500;
    }
    .link-text {
      font-size: 13px;
      color: #525252;
      word-break: break-all;
      margin: 8px 0 0 0;
    }
    @media only screen and (max-width: 600px) {
      .container {
        margin: 0;
        border: none;
      }
      .header,
      .content,
      .footer {
        padding: 32px 24px;
      }
      .code {
        font-size: 22px;
        letter-spacing: 1px;
      }
    }
  </style>
</head>
<body>
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fafafa;">
    <tr>
      <td align="center">
        <div class="container">
          <div class="header">
            <h1 class="logo">E-COMMERCE STORE</h1>
          </div>
          <div class="content">
            ${content}
          </div>
          <div class="footer">
            <p>${footer.automated}</p>
            <p>${new Date().getFullYear()} ${footer.rights}</p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

// ==========================================
// WELCOME EMAIL
// ==========================================
export const welcomeEmailTemplate = (
  firstName: string,
  lastName: string,
  lang: Language,
): string => {
  const texts =
    lang === Language.VI
      ? {
          title: `Chào mừng ${firstName} ${lastName}`,
          greeting: `Xin chào ${firstName} ${lastName},`,
          message: 'Cảm ơn bạn đã tham gia cộng đồng của chúng tôi.',
          description:
            'Tài khoản của bạn đã được kích hoạt thành công. Bạn có thể bắt đầu khám phá các sản phẩm và dịch vụ của chúng tôi ngay bây giờ.',
          features: [
            'Voucher giảm giá đặc biệt cho thành viên mới',
            'Miễn phí vận chuyển cho đơn hàng đầu tiên',
            'Tích điểm và nhận phần thưởng',
            'Ưu tiên hỗ trợ khách hàng',
          ],
          button: 'Bắt đầu mua sắm',
          closing: 'Trân trọng,',
          team: 'Đội ngũ E-commerce Store',
        }
      : {
          title: `Welcome ${firstName} ${lastName}`,
          greeting: `Hello ${firstName} ${lastName},`,
          message: 'Thank you for joining our community.',
          description:
            'Your account has been successfully activated. You can now start exploring our products and services.',
          features: [
            'Special discount vouchers for new members',
            'Free shipping on your first order',
            'Earn points and get rewards',
            'Priority customer support',
          ],
          button: 'Start Shopping',
          closing: 'Best regards,',
          team: 'The E-commerce Store Team',
        };

  const content = `
    <h2>${texts.title}</h2>
    <p>${texts.greeting}</p>
    <p>${texts.message}</p>
    <p>${texts.description}</p>
    
    <div class="info-box">
      ${texts.features.map((feature) => `<p>${feature}</p>`).join('')}
    </div>
    
    <div style="text-align: center;">
      <a href="{{APP_URL}}" class="button">${texts.button}</a>
    </div>
    
    <div class="divider"></div>
    
    <p>${texts.closing}</p>
    <p class="highlight">${texts.team}</p>
  `;

  return baseLayout(content, lang);
};

// ==========================================
// EMAIL VERIFICATION
// ==========================================
export const verificationEmailTemplate = (
  firstName: string,
  lastName: string,
  token: string,
  verifyUrl: string,
  lang: Language,
): string => {
  const texts =
    lang === Language.VI
      ? {
          title: 'Xác nhận địa chỉ email',
          greeting: `Xin chào ${firstName} ${lastName},`,
          message:
            'Vui lòng xác nhận địa chỉ email của bạn để hoàn tất đăng ký tài khoản.',
          instruction: 'Nhấp vào nút bên dưới để xác nhận:',
          button: 'Xác nhận email',
          alternative: 'Hoặc sao chép liên kết sau vào trình duyệt:',
          expiry: 'Liên kết này sẽ hết hạn sau 24 giờ.',
          noRequest:
            'Nếu bạn không yêu cầu xác nhận này, vui lòng bỏ qua email này.',
        }
      : {
          title: 'Verify your email address',
          greeting: `Hello ${firstName} ${lastName},`,
          message:
            'Please verify your email address to complete your account registration.',
          instruction: 'Click the button below to verify:',
          button: 'Verify email',
          alternative: 'Or copy this link into your browser:',
          expiry: 'This link will expire in 24 hours.',
          noRequest:
            "If you didn't request this verification, please ignore this email.",
        };

  const content = `
    <h2>${texts.title}</h2>
    <p>${texts.greeting}</p>
    <p>${texts.message}</p>
    <p>${texts.instruction}</p>
    
    <div style="text-align: center;">
      <a href="${verifyUrl}" class="button">${texts.button}</a>
    </div>
    
    <div class="info-box">
      <p style="margin-bottom: 8px;">${texts.alternative}</p>
      <p class="link-text">${verifyUrl}</p>
    </div>
    
    <div class="divider"></div>
    
    <p style="font-size: 13px; color: #737373;">${texts.expiry}</p>
    <p style="font-size: 13px; color: #737373;">${texts.noRequest}</p>
  `;

  return baseLayout(content, lang);
};

// ==========================================
// PASSWORD RESET
// ==========================================
export const passwordResetTemplate = (
  firstName: string,
  lastName: string,
  token: string,
  resetUrl: string,
  lang: Language,
): string => {
  const texts =
    lang === Language.VI
      ? {
          title: 'Đặt lại mật khẩu',
          greeting: `Xin chào ${firstName} ${lastName},`,
          message:
            'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.',
          instruction: 'Nhấp vào nút bên dưới để tạo mật khẩu mới:',
          button: 'Đặt lại mật khẩu',
          alternative: 'Hoặc sao chép liên kết sau vào trình duyệt:',
          expiry: 'Liên kết này sẽ hết hạn sau 1 giờ.',
          security:
            'Vì lý do bảo mật, bạn sẽ cần đăng nhập lại trên tất cả thiết bị sau khi đặt lại mật khẩu.',
          noRequest:
            'Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.',
        }
      : {
          title: 'Reset your password',
          greeting: `Hello ${firstName} ${lastName},`,
          message:
            'We received a request to reset the password for your account.',
          instruction: 'Click the button below to create a new password:',
          button: 'Reset password',
          alternative: 'Or copy this link into your browser:',
          expiry: 'This link will expire in 1 hour.',
          security:
            'For security reasons, you will need to log in again on all devices after resetting your password.',
          noRequest:
            "If you didn't request a password reset, please ignore this email.",
        };

  const content = `
    <h2>${texts.title}</h2>
    <p>${texts.greeting}</p>
    <p>${texts.message}</p>
    <p>${texts.instruction}</p>
    
    <div style="text-align: center;">
      <a href="${resetUrl}" class="button">${texts.button}</a>
    </div>
    
    <div class="info-box">
      <p style="margin-bottom: 8px;">${texts.alternative}</p>
      <p class="link-text">${resetUrl}</p>
    </div>
    
    <div class="divider"></div>
    
    <div class="warning-box">
      <p>${texts.security}</p>
    </div>
    
    <p style="font-size: 13px; color: #737373;">${texts.expiry}</p>
    <p style="font-size: 13px; color: #737373;">${texts.noRequest}</p>
  `;

  return baseLayout(content, lang);
};

// ==========================================
// ORDER CONFIRMATION
// ==========================================
export const orderConfirmationTemplate = (
  orderNumber: string,
  totalAmount: number,
  lang: Language,
): string => {
  const formattedAmount = new Intl.NumberFormat(
    lang === Language.VI ? 'vi-VN' : 'en-US',
    {
      style: 'currency',
      currency: lang === Language.VI ? 'VND' : 'USD',
    },
  ).format(totalAmount);

  const texts =
    lang === Language.VI
      ? {
          title: 'Xác nhận đơn hàng',
          message: 'Cảm ơn bạn đã đặt hàng.',
          description:
            'Đơn hàng của bạn đã được tiếp nhận và đang chờ thanh toán.',
          orderLabel: 'Mã đơn hàng',
          amountLabel: 'Tổng tiền',
          paymentInfo:
            'Vui lòng hoàn tất thanh toán trong vòng 15 phút để xác nhận đơn hàng.',
          button: 'Thanh toán ngay',
          warning: 'Đơn hàng sẽ tự động hủy sau 15 phút nếu chưa thanh toán.',
        }
      : {
          title: 'Order confirmation',
          message: 'Thank you for your order.',
          description: 'Your order has been received and is awaiting payment.',
          orderLabel: 'Order number',
          amountLabel: 'Total amount',
          paymentInfo:
            'Please complete payment within 15 minutes to confirm your order.',
          button: 'Pay now',
          warning:
            'Order will be automatically cancelled after 15 minutes if not paid.',
        };

  const content = `
    <h2>${texts.title}</h2>
    <p>${texts.message}</p>
    <p>${texts.description}</p>
    
    <div class="code-box">
      <p class="code-label">${texts.orderLabel}</p>
      <p class="code">${orderNumber}</p>
    </div>
    
    <div class="info-box">
      <p style="font-size: 15px;"><span class="highlight">${texts.amountLabel}:</span> ${formattedAmount}</p>
    </div>
    
    <p>${texts.paymentInfo}</p>
    
    <div style="text-align: center;">
      <a href="{{APP_URL}}/orders/${orderNumber}" class="button">${texts.button}</a>
    </div>
    
    <div class="warning-box">
      <p>${texts.warning}</p>
    </div>
  `;

  return baseLayout(content, lang);
};

// ==========================================
// PAYMENT CONFIRMED
// ==========================================
export const paymentConfirmedTemplate = (
  orderNumber: string,
  totalAmount: number,
  lang: Language,
): string => {
  const formattedAmount = new Intl.NumberFormat(
    lang === Language.VI ? 'vi-VN' : 'en-US',
    {
      style: 'currency',
      currency: lang === Language.VI ? 'VND' : 'USD',
    },
  ).format(totalAmount);

  const texts =
    lang === Language.VI
      ? {
          title: 'Thanh toán thành công',
          message: 'Đơn hàng của bạn đã được thanh toán thành công.',
          description:
            'Chúng tôi đang xử lý đơn hàng và sẽ giao hàng sớm nhất có thể.',
          orderLabel: 'Mã đơn hàng',
          amountLabel: 'Số tiền đã thanh toán',
          nextSteps: 'Các bước tiếp theo',
          steps: [
            'Xác nhận đơn hàng',
            'Đóng gói và chuẩn bị giao hàng',
            'Vận chuyển đến địa chỉ của bạn',
            'Giao hàng thành công',
          ],
          button: 'Theo dõi đơn hàng',
          support:
            'Nếu bạn có câu hỏi, vui lòng liên hệ bộ phận hỗ trợ khách hàng.',
        }
      : {
          title: 'Payment successful',
          message: 'Your order has been paid successfully.',
          description:
            "We're processing your order and will ship it as soon as possible.",
          orderLabel: 'Order number',
          amountLabel: 'Amount paid',
          nextSteps: 'Next steps',
          steps: [
            'Order confirmation',
            'Packing and preparing for shipment',
            'Shipping to your address',
            'Successful delivery',
          ],
          button: 'Track order',
          support:
            'If you have any questions, please contact our customer support.',
        };

  const content = `
    <h2>${texts.title}</h2>
    
    <div class="success-box">
      <p>${texts.message}</p>
    </div>
    
    <p>${texts.description}</p>
    
    <div class="code-box">
      <p class="code-label">${texts.orderLabel}</p>
      <p class="code">${orderNumber}</p>
    </div>
    
    <div class="info-box">
      <p style="font-size: 15px;"><span class="highlight">${texts.amountLabel}:</span> ${formattedAmount}</p>
    </div>
    
    <p class="highlight" style="margin-top: 32px; margin-bottom: 16px;">${texts.nextSteps}</p>
    <div class="info-box">
      ${texts.steps.map((step) => `<p>${step}</p>`).join('')}
    </div>
    
    <div style="text-align: center;">
      <a href="{{APP_URL}}/orders/${orderNumber}" class="button">${texts.button}</a>
    </div>
    
    <div class="divider"></div>
    
    <p style="font-size: 13px; color: #737373; text-align: center;">${texts.support}</p>
  `;

  return baseLayout(content, lang);
};

export default {
  welcomeEmailTemplate,
  verificationEmailTemplate,
  passwordResetTemplate,
  orderConfirmationTemplate,
  paymentConfirmedTemplate,
};
