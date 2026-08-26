import { ConfigService } from '@nestjs/config';
import { SessionPolicyService } from './session-policy.service';

describe('SessionPolicyService', () => {
  const idleTimeout = '30m';
  const absoluteLifetime = '7d';

  let service: SessionPolicyService;

  beforeEach(() => {
    const configService = new ConfigService({
      JWT_SESSION_IDLE_TIMEOUT: idleTimeout,
      JWT_SESSION_ABSOLUTE_LIFETIME: absoluteLifetime,
    });

    service = new SessionPolicyService(configService);
  });

  describe('duration configuration', () => {
    it('should parse the configured idle timeout', () => {
      expect(service.getIdleTimeoutMs()).toBe(30 * 60 * 1000);
    });

    it('should parse the configured absolute lifetime', () => {
      expect(service.getAbsoluteLifetimeMs()).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });

  describe('isIdle', () => {
    it('should consider a session idle when the idle timeout is reached', () => {
      const now = new Date('2026-08-26T12:30:00.000Z');
      const lastActiveAt = new Date('2026-08-26T12:00:00.000Z');

      expect(service.isIdle(lastActiveAt, now)).toBe(true);
    });

    it('should consider a session active before the idle timeout', () => {
      const now = new Date('2026-08-26T12:29:59.999Z');
      const lastActiveAt = new Date('2026-08-26T12:00:00.000Z');

      expect(service.isIdle(lastActiveAt, now)).toBe(false);
    });
  });

  describe('isAbsolutelyExpired', () => {
    it('should consider a session expired when the absolute lifetime is reached', () => {
      const createdAt = new Date('2026-08-19T12:00:00.000Z');
      const now = new Date('2026-08-26T12:00:00.000Z');

      expect(service.isAbsolutelyExpired(createdAt, now)).toBe(true);
    });

    it('should consider a session valid before the absolute lifetime', () => {
      const createdAt = new Date('2026-08-19T12:00:00.000Z');
      const now = new Date('2026-08-26T11:59:59.999Z');

      expect(service.isAbsolutelyExpired(createdAt, now)).toBe(false);
    });
  });

  describe('isExpired', () => {
    it('should expire a session when expiresAt is reached', () => {
      const createdAt = new Date('2026-08-26T08:00:00.000Z');
      const lastActiveAt = new Date('2026-08-26T12:20:00.000Z');
      const expiresAt = new Date('2026-08-26T12:30:00.000Z');
      const now = new Date('2026-08-26T12:30:00.000Z');

      expect(service.isExpired(createdAt, lastActiveAt, expiresAt, now)).toBe(
        true,
      );
    });

    it('should expire a session that has been idle too long', () => {
      const createdAt = new Date('2026-08-26T08:00:00.000Z');
      const lastActiveAt = new Date('2026-08-26T12:00:00.000Z');
      const expiresAt = new Date('2026-09-02T08:00:00.000Z');
      const now = new Date('2026-08-26T12:30:00.000Z');

      expect(service.isExpired(createdAt, lastActiveAt, expiresAt, now)).toBe(
        true,
      );
    });

    it('should expire a session that reaches its absolute lifetime', () => {
      const createdAt = new Date('2026-08-19T12:00:00.000Z');
      const lastActiveAt = new Date('2026-08-26T11:50:00.000Z');
      const expiresAt = new Date('2026-09-02T12:00:00.000Z');
      const now = new Date('2026-08-26T12:00:00.000Z');

      expect(service.isExpired(createdAt, lastActiveAt, expiresAt, now)).toBe(
        true,
      );
    });

    it('should consider an active session valid', () => {
      const createdAt = new Date('2026-08-26T08:00:00.000Z');
      const lastActiveAt = new Date('2026-08-26T12:20:00.000Z');
      const expiresAt = new Date('2026-09-02T08:00:00.000Z');
      const now = new Date('2026-08-26T12:25:00.000Z');

      expect(service.isExpired(createdAt, lastActiveAt, expiresAt, now)).toBe(
        false,
      );
    });
  });

  describe('invalid configuration', () => {
    it('should reject an invalid idle timeout', () => {
      const configService = new ConfigService({
        JWT_SESSION_IDLE_TIMEOUT: 'invalid',
        JWT_SESSION_ABSOLUTE_LIFETIME: absoluteLifetime,
      });

      expect(() => new SessionPolicyService(configService)).toThrow(
        'Invalid session duration',
      );
    });

    it('should reject an invalid absolute lifetime', () => {
      const configService = new ConfigService({
        JWT_SESSION_IDLE_TIMEOUT: idleTimeout,
        JWT_SESSION_ABSOLUTE_LIFETIME: 'invalid',
      });

      expect(() => new SessionPolicyService(configService)).toThrow(
        'Invalid session duration',
      );
    });
  });
});
