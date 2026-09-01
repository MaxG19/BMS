import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { RedisService } from '../common/redis/redis.service';

const VERIFICATION_REQUEST_LIMIT = 5;
const VERIFICATION_REQUEST_WINDOW_SECONDS = 15 * 60;

@Injectable()
export class EmailVerificationRateLimitService {
  constructor(private readonly redisService: RedisService) {}

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async checkRequestLimit(email: string): Promise<void> {
    const normalizedEmail = this.normalizeEmail(email);
    const key = `email-verification:requests:${normalizedEmail}`;

    const count = await this.redisService.incrementWithExpiry(
      key,
      VERIFICATION_REQUEST_WINDOW_SECONDS,
    );

    if (count > VERIFICATION_REQUEST_LIMIT) {
      throw new HttpException(
        'Too many email verification requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
