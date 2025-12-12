import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  CanActivate,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@database/prisma.service';
import { I18nService } from 'nestjs-i18n';
import { IS_PUBLIC_KEY } from '../decorators/permissions.decorator';
import { getLanguageFromContext } from '../utils/language.util';
import { Response } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private callCounter = 0;
  // Track refresh operations per user to prevent duplicates
  private refreshingUsers = new Set<string>();

  constructor(
    private reflector: Reflector,
    private jwtService: JwtService,
    private configService: ConfigService,
    private prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const callId = ++this.callCounter;
    const request = context.switchToHttp().getRequest();
    const lang = getLanguageFromContext(context);

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const response = context.switchToHttp().getResponse<Response>();

    if (request.user) {
      return true;
    }

    const accessToken = this.extractAccessToken(request);
    const refreshToken = this.extractRefreshToken(request);

    if (accessToken) {
      try {
        const payload = this.jwtService.verify(accessToken, {
          secret: this.configService.get<string>('jwt.secret'),
        });

        const expiresIn = payload.exp - Math.floor(Date.now() / 1000);

        request.user = await this.getUserFromPayload(payload);

        const autoRefresh = this.configService.get<boolean>('jwt.autoRefresh');

        // Background refresh: only if token expires soon AND not already refreshing
        if (
          autoRefresh &&
          expiresIn < 300 &&
          refreshToken &&
          !this.refreshingUsers.has(payload.sub)
        ) {
          this.refreshTokenInBackground(
            refreshToken,
            response,
            callId,
            request,
            payload.sub,
          ).catch((err) => {
            console.log(
              `❌ [GUARD #${callId}] Background refresh failed:`,
              err.message,
            );
          });
        }

        return true;
      } catch (error) {
        const autoRefresh = this.configService.get<boolean>('jwt.autoRefresh');
        if (autoRefresh && refreshToken) {
          return this.tryRefreshToken(
            request,
            response,
            refreshToken,
            callId,
            lang,
          );
        }

        throw new UnauthorizedException(
          this.i18n.translate('auth.invalid_or_expired_token', { lang }),
        );
      }
    }

    const autoRefresh = this.configService.get<boolean>('jwt.autoRefresh');
    if (autoRefresh && refreshToken) {
      return this.tryRefreshToken(
        request,
        response,
        refreshToken,
        callId,
        lang,
      );
    }

    throw new UnauthorizedException(
      this.i18n.translate('auth.no_token_provided', { lang }),
    );
  }

  private async tryRefreshToken(
    request: any,
    response: Response,
    refreshToken: string,
    callId: number,
    lang: string,
  ): Promise<boolean> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });

      // Check if already refreshing for this user
      if (this.refreshingUsers.has(payload.sub)) {
        console.log(
          `⏳ [GUARD #${callId}] Already refreshing for user ${payload.sub}, waiting...`,
        );
        // Wait a bit and retry
        await new Promise((resolve) => setTimeout(resolve, 100));
        return this.tryRefreshToken(
          request,
          response,
          refreshToken,
          callId,
          lang,
        );
      }

      this.refreshingUsers.add(payload.sub);

      try {
        const storedToken = await this.prisma.refreshToken.findFirst({
          where: {
            token: refreshToken,
            userId: payload.sub,
            expiresAt: { gt: new Date() },
          },
          include: { user: true },
        });

        if (!storedToken || !storedToken.user.isActive) {
          throw new UnauthorizedException(
            this.i18n.translate('auth.invalid_refresh_token', { lang }),
          );
        }

        // Generate new tokens
        const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
          await this.generateTokenPair(storedToken.user, storedToken);

        // Set cookies
        this.setAuthCookies(response, newAccessToken, newRefreshToken);

        // Update request cookies for current request
        request.cookies = request.cookies || {};
        request.cookies.accessToken = newAccessToken;
        request.cookies.refreshToken = newRefreshToken;

        // Delete old refresh token
        await this.prisma.refreshToken.delete({
          where: { id: storedToken.id },
        });

        request.user = await this.getUserFromPayload({
          sub: storedToken.user.id,
        });

        console.log(`✅ [GUARD #${callId}] Token refreshed successfully`);

        return true;
      } finally {
        this.refreshingUsers.delete(payload.sub);
      }
    } catch (error) {
      throw new UnauthorizedException(
        this.i18n.translate('auth.failed_to_refresh_token', { lang }),
      );
    }
  }

  private async refreshTokenInBackground(
    refreshToken: string,
    response: Response,
    callId: number,
    request: any,
    userId: string,
  ): Promise<void> {
    // Check if already refreshing
    if (this.refreshingUsers.has(userId)) {
      console.log(
        `⏭️  [BACKGROUND #${callId}] Skip: already refreshing user ${userId}`,
      );
      return;
    }

    this.refreshingUsers.add(userId);

    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });

      const storedToken = await this.prisma.refreshToken.findFirst({
        where: {
          token: refreshToken,
          userId: payload.sub,
          expiresAt: { gt: new Date() },
        },
        include: { user: true },
      });

      if (!storedToken) {
        console.log(`⚠️  [BACKGROUND #${callId}] Token not found or expired`);
        return;
      }

      // Generate new tokens
      const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
        await this.generateTokenPair(storedToken.user, storedToken);

      // Set cookies
      this.setAuthCookies(response, newAccessToken, newRefreshToken);

      // Update request cookies for current request
      request.cookies = request.cookies || {};
      request.cookies.accessToken = newAccessToken;
      request.cookies.refreshToken = newRefreshToken;

      // Delete old refresh token
      await this.prisma.refreshToken.delete({
        where: { id: storedToken.id },
      });

      console.log(`✅ [BACKGROUND #${callId}] Token refreshed in background`);
    } catch (error) {
      console.log(
        `❌ [BACKGROUND #${callId}] Error (silent): ${error.message}`,
      );
    } finally {
      this.refreshingUsers.delete(userId);
    }
  }

  private async generateTokenPair(
    user: any,
    storedToken: any,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
    };

    const accessToken = this.jwtService.sign(tokenPayload, {
      secret: this.configService.get<string>('jwt.secret'),
      expiresIn: this.configService.get<string>('jwt.accessTokenExpiry'),
    } as any);

    const newRefreshToken = this.jwtService.sign(tokenPayload, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: this.configService.get<string>('jwt.refreshTokenExpiry'),
    } as any);

    // Create new refresh token in DB
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: newRefreshToken,
        expiresAt,
        deviceInfo: storedToken.deviceInfo,
        ipAddress: storedToken.ipAddress,
      },
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  private extractAccessToken(request: any): string | null {
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return request.cookies?.accessToken || null;
  }

  private extractRefreshToken(request: any): string | null {
    return request.cookies?.refreshToken || null;
  }

  private async getUserFromPayload(payload: any) {
    return this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        permissions: true,
        isActive: true,
        isEmailVerified: true,
      },
    });
  }

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ) {
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/',
    };

    res.cookie('accessToken', accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refreshToken', refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
}
