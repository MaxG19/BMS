import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PasswordRecoveryService } from './password-recovery.service';
import { EmailVerificationService } from './email-verification.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AccessTokenGuard } from './guards/access-token.guard';
import type { AuthenticatedRequest } from './guards/access-token.guard';
import { InvitationService } from './invitation.service';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordRecoveryService: PasswordRecoveryService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly invitationService: InvitationService,
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.passwordRecoveryService.requestReset(dto.email);
  }

  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.passwordRecoveryService.resetPassword(dto.token, dto.password);
  }

  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<void> {
    await this.emailVerificationService.verifyEmail(dto.token);
  }

  @Post('accept-invitation')
  @UseGuards(AccessTokenGuard)
  async acceptInvitation(
    @Body() dto: AcceptInvitationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const identity = await this.authService.getIdentityEmail(
      request.user.identityId,
    );

    return this.invitationService.acceptInvitation(
      dto.token,
      request.user.identityId,
      identity,
    );
  }

  @Post('logout')
  @UseGuards(AccessTokenGuard)
  async logout(@Req() request: AuthenticatedRequest) {
    await this.authService.logout(
      request.user.identityId,
      request.user.sessionId,
    );

    return {
      message: 'Logged out successfully',
    };
  }

  @Post('logout-all')
  @UseGuards(AccessTokenGuard)
  async logoutAll(@Req() request: AuthenticatedRequest) {
    const revokedSessionCount = await this.authService.logoutAll(
      request.user.identityId,
    );

    return {
      revokedSessionCount,
    };
  }

  @Post('change-password')
  @UseGuards(AccessTokenGuard)
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.authService.changePassword(
      request.user.identityId,
      request.user.sessionId,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}
