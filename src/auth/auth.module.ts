import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma/prisma.module';
import { NotificationModule } from '../common/notifications/notification.module';
import { AccessTokenService } from './access-token.service';
import { AccessTokenVerificationService } from './access-token-verification.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordHashService } from './password-hash.service';
import { PasswordPolicyService } from './password-policy.service';
import { PasswordRecoveryService } from './password-recovery.service';
import { RefreshTokenService } from './refresh-token.service';
import { SessionPolicyService } from './session-policy.service';
import { SessionRevocationService } from './session-revocation.service';
import { PasswordRecoveryRateLimitModule } from './password-recovery-rate-limit.module';
import { EmailVerificationService } from './email-verification.service';
import { InvitationService } from './invitation.service';
import { EmailVerificationRateLimitModule } from './email-verification.rate-limit.module';

@Module({
  imports: [
    PrismaModule,
    NotificationModule,
    PasswordRecoveryRateLimitModule,
    EmailVerificationRateLimitModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordHashService,
    PasswordPolicyService,
    PasswordRecoveryService,
    RefreshTokenService,
    AccessTokenService,
    AccessTokenVerificationService,
    SessionPolicyService,
    SessionRevocationService,
    EmailVerificationService,
    InvitationService,
  ],
  exports: [
    AuthService,
    PasswordRecoveryService,
    AccessTokenVerificationService,
    InvitationService,
  ],
})
export class AuthModule {}
