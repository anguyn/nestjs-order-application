import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Res,
  Req,
  HttpCode,
  HttpStatus,
  Delete,
  Param,
  Query,
  Inject,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import type { ConfigType } from '@nestjs/config';
import type { Response, Request } from 'express';
import { I18nService } from 'nestjs-i18n';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, RefreshTokenDto } from './dto/auth.dto';
import { JwtAuthGuard } from '@shared/guards/jwt-auth.guard';
import { Public } from '@shared/decorators/permissions.decorator';
import { CurrentUser, GetLanguage } from '@shared/decorators/user.decorator';
import type { AuthenticatedUser } from '@shared/types/common.types';
import appConfig from '@config/app.config';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly i18n: I18nService,
    @Inject(appConfig.KEY)
    private readonly app: ConfigType<typeof appConfig>,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register new user' })
  @ApiResponse({
    status: 201,
    description: 'User registered successfully. Verification email sent.',
  })
  @ApiResponse({
    status: 409,
    description: 'Email already exists',
  })
  async register(@Body() dto: RegisterDto, @GetLanguage() lang: string) {
    return this.authService.register(dto, lang);
  }

  @Public()
  @Get('verify-email')
  @ApiOperation({ summary: 'Verify email address' })
  @ApiResponse({
    status: 200,
    description: 'Email verified successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired verification token',
  })
  async verifyEmail(
    @Query('token') token: string,
    @GetLanguage() lang: string,
  ) {
    return this.authService.verifyEmail(token, lang);
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend verification email' })
  @ApiResponse({
    status: 200,
    description: 'Verification email sent successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Email already verified or user not found',
  })
  async resendVerification(
    @Body() dto: { email: string },
    @GetLanguage() lang: string,
  ) {
    return this.authService.resendVerification(dto.email, lang);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset email' })
  @ApiResponse({
    status: 200,
    description: 'If email exists, reset link has been sent',
  })
  async forgotPassword(
    @Body() dto: { email: string },
    @GetLanguage() lang: string,
  ) {
    return this.authService.forgotPassword(dto.email, lang);
  }

  @Public()
  @Get('validate-reset-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate password reset token' })
  @ApiResponse({
    status: 200,
    description: 'Token is valid',
  })
  @ApiResponse({
    status: 400,
    description: 'Token is invalid or expired',
  })
  async validateResetToken(
    @Query('token') token: string,
    @GetLanguage() lang: string,
  ) {
    return this.authService.validateResetToken(token, lang);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using token' })
  @ApiResponse({
    status: 200,
    description: 'Password reset successfully. All sessions revoked.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired reset token',
  })
  async resetPassword(
    @Body() dto: { token: string; newPassword: string },
    @GetLanguage() lang: string,
  ) {
    return this.authService.resetPassword(dto.token, dto.newPassword, lang);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({
    status: 200,
    description: 'Login successful. Tokens returned and set in cookies.',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials or email not verified',
  })
  async login(
    @Body() dto: LoginDto,
    @GetLanguage() lang: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, lang);

    this.setAuthCookies(
      res,
      result.tokens.accessToken,
      result.tokens.refreshToken,
    );

    return {
      message: this.i18n.translate('auth.login_success', { lang }),
      user: result.user,
      tokens: result.tokens,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Refresh token is required',
  })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @GetLanguage() lang: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refreshToken || dto.refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedException(
        this.i18n.translate('auth.refresh_token_required', { lang }),
      );
    }

    const tokens = await this.authService.refreshAccessToken(
      refreshToken,
      lang,
    );
    this.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

    return {
      message: this.i18n.translate('auth.token_refreshed', { lang }),
      ...tokens,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Logout user from current device' })
  @ApiResponse({
    status: 200,
    description: 'Logged out successfully from current device',
  })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @GetLanguage() lang: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refreshToken;
    await this.authService.logout(user.id, refreshToken);

    this.clearAuthCookies(res);

    return {
      message: this.i18n.translate('auth.logout_success', { lang }),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Logout user from all devices' })
  @ApiResponse({
    status: 200,
    description: 'Logged out from all devices successfully',
  })
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @GetLanguage() lang: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logoutAll(user.id);

    this.clearAuthCookies(res);

    return {
      message: this.i18n.translate('auth.logout_all_success', { lang }),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
  })
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return { user };
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get all active refresh tokens/sessions' })
  @ApiResponse({
    status: 200,
    description: 'Active sessions retrieved successfully',
  })
  async getSessions(@CurrentUser() user: AuthenticatedUser) {
    const tokens = await this.authService.getActiveRefreshTokens(user.id);
    return {
      count: tokens.length,
      sessions: tokens,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Revoke specific session/refresh token' })
  @ApiResponse({
    status: 200,
    description: 'Session revoked successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Session not found',
  })
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
    @GetLanguage() lang: string,
  ) {
    await this.authService.revokeRefreshToken(user.id, sessionId);
    return {
      message: this.i18n.translate('auth.session_revoked', { lang }),
    };
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

  private clearAuthCookies(res: Response) {
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/' });
  }
}
