import { HttpStatus } from '@nestjs/common';
import { EmailVerificationRateLimitService } from './email-verification.rate-limit.service';

describe('EmailVerificationRateLimitService', () => {
  let service: EmailVerificationRateLimitService;

  const redisService = {
    incrementWithExpiry: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new EmailVerificationRateLimitService(redisService as never);
  });

  describe('normalizeEmail', () => {
    it('should trim whitespace and normalize the email to lowercase', () => {
      expect(service.normalizeEmail('  JOHN@EXAMPLE.COM  ')).toBe(
        'john@example.com',
      );
    });

    it('should preserve an already normalized email', () => {
      expect(service.normalizeEmail('john@example.com')).toBe(
        'john@example.com',
      );
    });
  });

  describe('checkRequestLimit', () => {
    it('should allow requests within the configured limit', async () => {
      redisService.incrementWithExpiry.mockResolvedValue(1);

      await expect(
        service.checkRequestLimit('john@example.com'),
      ).resolves.toBeUndefined();

      expect(redisService.incrementWithExpiry).toHaveBeenCalledWith(
        'email-verification:requests:john@example.com',
        15 * 60,
      );
    });

    it('should allow the fifth verification request', async () => {
      redisService.incrementWithExpiry.mockResolvedValue(5);

      await expect(
        service.checkRequestLimit('john@example.com'),
      ).resolves.toBeUndefined();

      expect(redisService.incrementWithExpiry).toHaveBeenCalledTimes(1);
    });

    it('should reject the sixth verification request', async () => {
      redisService.incrementWithExpiry.mockResolvedValue(6);

      await expect(
        service.checkRequestLimit('john@example.com'),
      ).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
        message:
          'Too many email verification requests. Please try again later.',
      });

      expect(redisService.incrementWithExpiry).toHaveBeenCalledTimes(1);
    });

    it('should normalize the email before constructing the Redis key', async () => {
      redisService.incrementWithExpiry.mockResolvedValue(1);

      await service.checkRequestLimit('  JOHN@EXAMPLE.COM  ');

      expect(redisService.incrementWithExpiry).toHaveBeenCalledWith(
        'email-verification:requests:john@example.com',
        15 * 60,
      );
    });

    it('should use a separate Redis namespace from password reset requests', async () => {
      redisService.incrementWithExpiry.mockResolvedValue(1);

      await service.checkRequestLimit('john@example.com');

      const [key] = redisService.incrementWithExpiry.mock.calls[0] as [
        string,
        number,
      ];

      expect(key).toBe('email-verification:requests:john@example.com');
      expect(key).not.toContain('password-reset:requests');
    });

    it('should propagate Redis failures', async () => {
      const error = new Error('Redis unavailable');

      redisService.incrementWithExpiry.mockRejectedValue(error);

      await expect(
        service.checkRequestLimit('john@example.com'),
      ).rejects.toThrow('Redis unavailable');
    });
  });
});
