import { Module } from '@nestjs/common';
import { RedisModule } from '../common/redis/redis.module';
import { EmailVerificationRateLimitService } from './email-verification.rate-limit.service';

@Module({
  imports: [RedisModule],
  providers: [EmailVerificationRateLimitService],
  exports: [EmailVerificationRateLimitService],
})
export class EmailVerificationRateLimitModule {}
