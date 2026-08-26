import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AccessTokenGuard } from './guards/access-token.guard';
import type { AuthenticatedRequest } from './guards/access-token.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
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
}
