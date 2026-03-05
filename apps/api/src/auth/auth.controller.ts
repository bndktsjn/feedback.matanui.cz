import { BadRequestException, Body, Controller, Delete, Get, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  UpdateMeDto,
  ChangePasswordDto,
  ChangeEmailDto,
} from './dto';
import { StorageService } from '../storage/storage.service';
import { SessionGuard } from './guards/session.guard';
import { CsrfGuard } from './guards/csrf.guard';
import { CurrentUser } from './decorators/current-user.decorator';

interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly storageService: StorageService,
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res() res: Response) {
    const user = await this.authService.register(dto);

    req.session.userId = user.id;
    this.setCsrfCookie(res);

    req.session.save(() => {
      res.status(201).json(user);
    });
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res() res: Response) {
    const user = await this.authService.validateLogin(dto.email, dto.password);

    req.session.userId = user.id;
    this.setCsrfCookie(res);

    req.session.save(() => {
      res.json(user);
    });
  }

  @Post('logout')
  @UseGuards(SessionGuard)
  async logout(@Req() req: Request, @Res() res: Response) {
    req.session.destroy(() => {
      res.clearCookie('feedback_sid');
      res.clearCookie('csrf_token');
      res.json({ message: 'Logged out' });
    });
  }

  @Get('me')
  @UseGuards(SessionGuard)
  async me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Patch('me')
  @UseGuards(SessionGuard, CsrfGuard)
  async updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateMeDto) {
    return this.authService.updateMe(user.id, dto);
  }

  @Post('change-password')
  @UseGuards(SessionGuard, CsrfGuard)
  async changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.id, dto);
  }

  @Post('change-email')
  @UseGuards(SessionGuard, CsrfGuard)
  async changeEmail(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangeEmailDto) {
    return this.authService.changeEmail(user.id, dto);
  }

  @Post('avatar-upload-url')
  @UseGuards(SessionGuard, CsrfGuard)
  async getAvatarUploadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { filename: string; mimeType: string },
  ) {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowed.includes(body.mimeType)) {
      throw new BadRequestException('Invalid file type. Allowed: JPEG, PNG, GIF, WebP');
    }
    return this.storageService.getPresignedUploadUrl(
      `avatars/${user.id}`,
      body.filename,
      body.mimeType,
      300,
    );
  }

  @Delete('account')
  @UseGuards(SessionGuard, CsrfGuard)
  async deleteAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { password: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.authService.deleteAccount(user.id, body.password);
    req.session.destroy(() => {
      res.clearCookie('feedback_sid');
      res.clearCookie('csrf_token');
      res.json({ message: 'Account deleted' });
    });
  }

  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    return { message: 'If an account with that email exists, a reset link has been sent.' };
  }

  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { message: 'Password reset successfully. You can now log in.' };
  }

  @Post('verify-email')
  async verifyEmail(@Body('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  private setCsrfCookie(res: Response) {
    const csrfToken = randomBytes(32).toString('hex');
    res.cookie('csrf_token', csrfToken, {
      httpOnly: false, // JS must read this cookie
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
  }
}
