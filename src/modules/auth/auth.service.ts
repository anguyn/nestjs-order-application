import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '@database/prisma.service';
import { hashPassword, comparePassword } from '@shared/utils/password.util';
import { ROLE_PERMISSIONS } from '@shared/constants/permissions.constant';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { UserRole, Language } from '@generated/prisma/client';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly i18n: I18nService,
    @InjectQueue('email') private emailQueue: Queue,
  ) {}

  async register(dto: RegisterDto, lang = 'en') {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException(
        this.i18n.translate('auth.email_exists', { lang }),
      );
    }

    const verifyToken = randomBytes(32).toString('hex');
    const verifyExpiry = this.calculateTokenExpiry(
      this.configService.get<number>('jwt.emailVerifyTokenExpiryHours', 24),
    );

    const hashedPassword = await hashPassword(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: UserRole.USER,
        permissions: ROLE_PERMISSIONS.USER,
        language: dto.language || Language.EN,
        isEmailVerified: false,
        emailVerifyToken: verifyToken,
        emailVerifyExpiry: verifyExpiry,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        permissions: true,
        language: true,
        isEmailVerified: true,
        createdAt: true,
      },
    });

    await this.emailQueue.add('send-verification', {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      token: verifyToken,
      language: user.language,
    });

    return { user };
  }

  async verifyEmail(token: string, lang = 'en') {
    const user = await this.prisma.user.findFirst({
      where: {
        emailVerifyToken: token,
        emailVerifyExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException(
        this.i18n.translate('auth.invalid_verify_token', { lang }),
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        emailVerifyToken: null,
        emailVerifyExpiry: null,
      },
    });

    await this.emailQueue.add('send-welcome', {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      language: user.language,
    });

    return { message: this.i18n.translate('auth.email_verified', { lang }) };
  }

  async resendVerification(email: string, lang = 'en') {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new BadRequestException(
        this.i18n.translate('auth.user_not_found', { lang }),
      );
    }

    if (user.isEmailVerified) {
      throw new BadRequestException(
        this.i18n.translate('auth.already_verified', { lang }),
      );
    }

    const verifyToken = randomBytes(32).toString('hex');
    const verifyExpiry = this.calculateTokenExpiry(
      this.configService.get<number>('jwt.emailVerifyTokenExpiryHours', 24),
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifyToken: verifyToken,
        emailVerifyExpiry: verifyExpiry,
      },
    });

    await this.emailQueue.add('send-verification', {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      token: verifyToken,
      language: user.language,
    });

    return { message: this.i18n.translate('auth.verification_sent', { lang }) };
  }

  async forgotPassword(email: string, lang = 'en') {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return {
        message: this.i18n.translate('auth.reset_email_sent', { lang }),
      };
    }

    const resetToken = randomBytes(32).toString('hex');
    const resetExpiry = this.calculateTokenExpiry(
      this.configService.get<number>('jwt.resetPasswordTokenExpiryHours', 1),
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: resetToken,
        resetPasswordExpiry: resetExpiry,
      },
    });

    await this.emailQueue.add('send-password-reset', {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      token: resetToken,
      language: user.language,
    });

    return { message: this.i18n.translate('auth.reset_email_sent', { lang }) };
  }

  async validateResetToken(token: string, lang = 'en') {
    const user = await this.prisma.user.findFirst({
      where: {
        resetPasswordToken: token,
        resetPasswordExpiry: {
          gt: new Date(),
        },
      },
    });

    if (!user) {
      throw new BadRequestException(
        this.i18n.translate('auth.invalid_reset_token', { lang }),
      );
    }

    return {
      isValid: true,
      message: this.i18n.translate('auth.valid_reset_token', { lang }),
    };
  }

  async resetPassword(token: string, newPassword: string, lang = 'en') {
    const user = await this.prisma.user.findFirst({
      where: {
        resetPasswordToken: token,
        resetPasswordExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException(
        this.i18n.translate('auth.invalid_reset_token', { lang }),
      );
    }

    const hashedPassword = await hashPassword(newPassword);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpiry: null,
      },
    });

    await this.prisma.refreshToken.deleteMany({
      where: { userId: user.id },
    });

    return {
      message: this.i18n.translate('auth.password_reset_success', { lang }),
    };
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return null;
    }

    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      return null;
    }

    if (!user.isActive) {
      return null;
    }

    return user;
  }

  async login(dto: LoginDto, lang = 'en') {
    const user = await this.validateUser(dto.email, dto.password);

    if (!user) {
      throw new UnauthorizedException(
        this.i18n.translate('auth.invalid_credentials', { lang }),
      );
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedException(
        this.i18n.translate('auth.email_not_verified', { lang }),
      );
    }

    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);

    await this.storeRefreshToken(user.id, refreshToken, dto.rememberMe);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        permissions: user.permissions,
        language: user.language,
        isEmailVerified: user.isEmailVerified,
      },
      tokens: {
        accessToken,
        refreshToken,
      },
    };
  }

  async refreshAccessToken(refreshToken: string, lang = 'en') {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });

      const storedToken = await this.prisma.refreshToken.findFirst({
        where: {
          token: refreshToken,
          userId: payload.sub,
        },
        include: { user: true },
      });

      if (!storedToken || storedToken.expiresAt < new Date()) {
        throw new UnauthorizedException(
          this.i18n.translate('auth.invalid_refresh_token', { lang }),
        );
      }

      if (!storedToken.user.isActive) {
        throw new UnauthorizedException(
          this.i18n.translate('auth.account_inactive', { lang }),
        );
      }

      await this.prisma.refreshToken.delete({
        where: { id: storedToken.id },
      });

      const newAccessToken = this.generateAccessToken(storedToken.user);
      const newRefreshToken = this.generateRefreshToken(storedToken.user);

      await this.storeRefreshToken(storedToken.user.id, newRefreshToken);

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      };
    } catch (error) {
      throw new UnauthorizedException(
        this.i18n.translate('auth.invalid_refresh_token', { lang }),
      );
    }
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      await this.prisma.refreshToken.deleteMany({
        where: {
          userId,
          token: refreshToken,
        },
      });
    }
  }

  async logoutAll(userId: string) {
    await this.prisma.refreshToken.deleteMany({
      where: { userId },
    });
  }

  async getActiveRefreshTokens(userId: string) {
    return this.prisma.refreshToken.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        deviceInfo: true,
        ipAddress: true,
      },
    });
  }

  async revokeRefreshToken(userId: string, tokenId: string) {
    await this.prisma.refreshToken.deleteMany({
      where: {
        id: tokenId,
        userId,
      },
    });
  }

  /**
   * Calculate token expiry date based on hours from now
   * @param hours - Number of hours until expiry
   */
  private calculateTokenExpiry(hours: number): Date {
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + hours);
    return expiry;
  }

  /**
   * Calculate refresh token expiry date based on days from now
   * @param days - Number of days until expiry
   */
  private calculateRefreshTokenExpiry(days: number): Date {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + days);
    return expiry;
  }

  /**
   * Generate JWT access token
   */
  private generateAccessToken(user: any): string {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
    };

    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.secret'),
      expiresIn: this.configService.get<string>('jwt.accessTokenExpiry'),
    } as any);
  }

  /**
   * Generate JWT refresh token
   */
  private generateRefreshToken(user: any): string {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
    };

    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: this.configService.get<string>('jwt.refreshTokenExpiry'),
    } as any);
  }

  /**
   * Store refresh token in database
   */
  private async storeRefreshToken(
    userId: string,
    token: string,
    rememberMe = false,
  ) {
    const expiryDays = rememberMe
      ? this.configService.get<number>(
          'jwt.refreshTokenExpiryDaysRememberMe',
          30,
        )
      : this.configService.get<number>('jwt.refreshTokenExpiryDays', 7);

    const expiresAt = this.calculateRefreshTokenExpiry(expiryDays);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        token,
        expiresAt,
      },
    });
  }
}
