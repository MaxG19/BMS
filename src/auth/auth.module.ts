import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordHashService } from './password-hash.service';
import { PasswordPolicyService } from './password-policy.service';
import { AccessTokenService } from './access-token.service';
import { RefreshTokenService } from './refresh-token.service';
import { AccessTokenVerificationService } from './access-token-verification.service';
import { AccessTokenGuard } from './guards/access-token.guard';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordHashService,
    PasswordPolicyService,
    AccessTokenService,
    RefreshTokenService,
    AccessTokenVerificationService,
    AccessTokenGuard,
  ],
})
export class AuthModule {}
