import { RedisService } from './redis.service';

describe('RedisService', () => {
  let service: RedisService;

  const redisClient = {
    ping: jest.fn(),
    quit: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
  };

  const configService = {
    getOrThrow: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    configService.getOrThrow.mockReturnValue('redis://localhost:6379');

    service = Object.create(RedisService.prototype) as RedisService;

    Object.defineProperty(service, 'client', {
      value: redisClient,
      writable: false,
    });
  });

  describe('incrementWithExpiry', () => {
    it('should increment a new counter and set its expiry', async () => {
      redisClient.incr.mockResolvedValue(1);
      redisClient.expire.mockResolvedValue(1);

      const result = await service.incrementWithExpiry(
        'password-reset:user@example.com',
        900,
      );

      expect(result).toBe(1);
      expect(redisClient.incr).toHaveBeenCalledWith(
        'password-reset:user@example.com',
      );
      expect(redisClient.expire).toHaveBeenCalledWith(
        'password-reset:user@example.com',
        900,
      );
    });

    it('should increment an existing counter without resetting its expiry', async () => {
      redisClient.incr.mockResolvedValue(2);

      const result = await service.incrementWithExpiry(
        'password-reset:user@example.com',
        900,
      );

      expect(result).toBe(2);
      expect(redisClient.incr).toHaveBeenCalledWith(
        'password-reset:user@example.com',
      );
      expect(redisClient.expire).not.toHaveBeenCalled();
    });
  });
});
