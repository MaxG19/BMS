import { Module } from '@nestjs/common';
import { PasswordRecoveryRateLimitService } from './password-recovery.rate-limit.service';

@Module({
  providers: [PasswordRecoveryRateLimitService],
  exports: [PasswordRecoveryRateLimitService],
})
export class PasswordRecoveryRateLimitModule {}
