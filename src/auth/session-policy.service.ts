import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

@Injectable()
export class SessionPolicyService {
  private readonly idleTimeoutMs: number;
  private readonly absoluteLifetimeMs: number;

  constructor(private readonly configService: ConfigService) {
    this.idleTimeoutMs = this.parseDuration(
      this.configService.getOrThrow<string>('JWT_SESSION_IDLE_TIMEOUT'),
    );

    this.absoluteLifetimeMs = this.parseDuration(
      this.configService.getOrThrow<string>('JWT_SESSION_ABSOLUTE_LIFETIME'),
    );
  }

  getIdleTimeoutMs(): number {
    return this.idleTimeoutMs;
  }

  getAbsoluteLifetimeMs(): number {
    return this.absoluteLifetimeMs;
  }

  isIdle(lastActiveAt: Date, now = new Date()): boolean {
    return now.getTime() - lastActiveAt.getTime() >= this.idleTimeoutMs;
  }

  isAbsolutelyExpired(createdAt: Date, now = new Date()): boolean {
    return now.getTime() - createdAt.getTime() >= this.absoluteLifetimeMs;
  }

  isExpired(
    createdAt: Date,
    lastActiveAt: Date,
    expiresAt: Date,
    now = new Date(),
  ): boolean {
    return (
      expiresAt.getTime() <= now.getTime() ||
      this.isIdle(lastActiveAt, now) ||
      this.isAbsolutelyExpired(createdAt, now)
    );
  }

  private parseDuration(value: string): number {
    const match = /^(\d+)([smhd])$/.exec(value.trim());

    if (!match) {
      throw new Error(
        `Invalid session duration "${value}". Expected formats such as 30m, 2h, or 7d.`,
      );
    }

    const amount = Number(match[1]);
    const unit = match[2];

    const secondsPerUnit: Record<string, number> = {
      s: 1,
      m: SECONDS_PER_MINUTE,
      h: SECONDS_PER_MINUTE * MINUTES_PER_HOUR,
      d: SECONDS_PER_MINUTE * MINUTES_PER_HOUR * HOURS_PER_DAY,
    };

    return amount * secondsPerUnit[unit] * MILLISECONDS_PER_SECOND;
  }
}
