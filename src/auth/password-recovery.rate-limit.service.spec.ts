import { HttpException, HttpStatus } from '@nestjs/common';
import { PasswordRecoveryRateLimitService } from './password-recovery.rate-limit.service';

describe('PasswordRecoveryRateLimitService', () => {
  let service: PasswordRecoveryRateLimitService;

  const incrementWithExpiryMock = jest.fn();

  const redisService = {
    incrementWithExpiry: incrementWithExpiryMock,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new PasswordRecoveryRateLimitService(redisService as never);
  });

  describe('normalizeEmail', () => {
    it('should trim and lowercase an email address', () => {
      expect(service.normalizeEmail('  USER@Example.COM  ')).toBe(
        'user@example.com',
      );
    });
  });

  describe('checkRequestLimit', () => {
    it('should allow a request below the limit', async () => {
      incrementWithExpiryMock.mockResolvedValue(1);

      await expect(
        service.checkRequestLimit('USER@example.com'),
      ).resolves.toBeUndefined();

      expect(incrementWithExpiryMock).toHaveBeenCalledWith(
        'password-reset:requests:user@example.com',
        900,
      );
    });

    it('should allow a request at the limit', async () => {
      incrementWithExpiryMock.mockResolvedValue(5);

      await expect(
        service.checkRequestLimit('user@example.com'),
      ).resolves.toBeUndefined();
    });

    it('should reject a request above the limit', async () => {
      incrementWithExpiryMock.mockResolvedValue(6);

      try {
        await service.checkRequestLimit('user@example.com');
        fail('Expected the request to be rejected');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    });

    it('should normalize the email before creating the Redis key', async () => {
      incrementWithExpiryMock.mockResolvedValue(1);

      await service.checkRequestLimit('  USER@Example.COM  ');

      expect(incrementWithExpiryMock).toHaveBeenCalledWith(
        'password-reset:requests:user@example.com',
        900,
      );
    });
  });
});
