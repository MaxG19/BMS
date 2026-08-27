import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { RedisService } from '../common/redis/redis.service';

const RESET_REQUEST_LIMIT = 5;
const RESET_REQUEST_WINDOW_SECONDS = 15 * 60;

@Injectable()
export class PasswordRecoveryRateLimitService {
  constructor(private readonly redisService: RedisService) {}

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async checkRequestLimit(email: string): Promise<void> {
    const normalizedEmail = this.normalizeEmail(email);
    const key = `password-reset:requests:${normalizedEmail}`;

    const count = await this.redisService.incrementWithExpiry(
      key,
      RESET_REQUEST_WINDOW_SECONDS,
    );

    if (count > RESET_REQUEST_LIMIT) {
      throw new HttpException(
        'Too many password reset requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
