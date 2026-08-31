import { Prisma } from '../generated/prisma/client';
import { SessionRevocationService } from './session-revocation.service';

describe('SessionRevocationService', () => {
  let service: SessionRevocationService;

  type SessionUpdateArgs = {
    where: {
      id?: string | { not: string };
      identityId: string;
      revokedAt: null;
    };
    data: {
      revokedAt: Date;
    };
  };

  type SessionUpdateResult = {
    count: number;
  };

  type AuditLogCreateArgs = {
    data: {
      identityId: string;
      eventType: string;
      metadata: {
        sessionId?: string;
        reason: string;
        revokedSessionCount?: number;
      };
    };
  };

  const sessionUpdateMock = jest.fn<
    Promise<SessionUpdateResult>,
    [SessionUpdateArgs]
  >();

  const auditLogCreateMock = jest.fn<
    Promise<{ id: string }>,
    [AuditLogCreateArgs]
  >();

  const transactionClient = {
    session: {
      updateMany: sessionUpdateMock,
    },
    auditLog: {
      create: auditLogCreateMock,
    },
  } as unknown as Prisma.TransactionClient;

  const prisma = {
    session: {
      updateMany: sessionUpdateMock,
    },
    auditLog: {
      create: auditLogCreateMock,
    },
    $transaction: jest.fn(
      async (callback: (tx: Prisma.TransactionClient) => Promise<number>) =>
        callback(transactionClient),
    ),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SessionRevocationService(prisma as never);
  });

  describe('revoke', () => {
    it('should revoke an active session', async () => {
      sessionUpdateMock.mockResolvedValue({ count: 1 });
      auditLogCreateMock.mockResolvedValue({ id: 'audit-id' });

      await service.revoke('session-id', 'identity-id');

      expect(sessionUpdateMock).toHaveBeenCalledTimes(1);

      const updateArguments = sessionUpdateMock.mock.calls[0]?.[0];

      expect(updateArguments).toBeDefined();
      expect(updateArguments?.where).toEqual({
        id: 'session-id',
        identityId: 'identity-id',
        revokedAt: null,
      });
      expect(updateArguments?.data.revokedAt).toBeInstanceOf(Date);

      expect(auditLogCreateMock).toHaveBeenCalledWith({
        data: {
          identityId: 'identity-id',
          eventType: 'SESSION_REVOKED',
          metadata: {
            sessionId: 'session-id',
            reason: 'USER_LOGOUT',
          },
        },
      });
    });

    it('should use the supplied revocation reason', async () => {
      sessionUpdateMock.mockResolvedValue({ count: 1 });
      auditLogCreateMock.mockResolvedValue({ id: 'audit-id' });

      await service.revoke('session-id', 'identity-id', 'IDLE_TIMEOUT');

      expect(auditLogCreateMock).toHaveBeenCalledWith({
        data: {
          identityId: 'identity-id',
          eventType: 'SESSION_REVOKED',
          metadata: {
            sessionId: 'session-id',
            reason: 'IDLE_TIMEOUT',
          },
        },
      });
    });

    it('should be idempotent when the session is already revoked', async () => {
      sessionUpdateMock.mockResolvedValue({ count: 0 });

      await expect(
        service.revoke('session-id', 'identity-id'),
      ).resolves.toBeUndefined();

      expect(sessionUpdateMock).toHaveBeenCalledTimes(1);
      expect(auditLogCreateMock).not.toHaveBeenCalled();
    });

    it('should not revoke a session belonging to another identity', async () => {
      sessionUpdateMock.mockResolvedValue({ count: 0 });

      await expect(
        service.revoke('session-id', 'another-identity-id'),
      ).resolves.toBeUndefined();

      const updateArguments = sessionUpdateMock.mock.calls[0]?.[0];

      expect(updateArguments?.where).toEqual({
        id: 'session-id',
        identityId: 'another-identity-id',
        revokedAt: null,
      });

      expect(auditLogCreateMock).not.toHaveBeenCalled();
    });

    it('should not create an audit log when revocation does not occur', async () => {
      sessionUpdateMock.mockResolvedValue({ count: 0 });

      await service.revoke('session-id', 'identity-id');

      expect(auditLogCreateMock).not.toHaveBeenCalled();
    });
  });

  describe('revokeRequired', () => {
    it('should revoke an active session and create an audit log', async () => {
      sessionUpdateMock.mockResolvedValue({ count: 1 });
      auditLogCreateMock.mockResolvedValue({ id: 'audit-id' });

      await service.revokeRequired('session-id', 'identity-id');

      expect(sessionUpdateMock).toHaveBeenCalledTimes(1);
      expect(auditLogCreateMock).toHaveBeenCalledTimes(1);
    });

    it('should reject when the session cannot be revoked', async () => {
      sessionUpdateMock.mockResolvedValue({ count: 0 });

      await expect(
        service.revokeRequired('session-id', 'identity-id'),
      ).rejects.toThrow('Invalid or expired session');

      expect(auditLogCreateMock).not.toHaveBeenCalled();
    });

    it('should use the supplied reason when required revocation succeeds', async () => {
      sessionUpdateMock.mockResolvedValue({ count: 1 });
      auditLogCreateMock.mockResolvedValue({ id: 'audit-id' });

      await service.revokeRequired(
        'session-id',
        'identity-id',
        'ADMIN_TERMINATION',
      );

      expect(auditLogCreateMock).toHaveBeenCalledWith({
        data: {
          identityId: 'identity-id',
          eventType: 'SESSION_REVOKED',
          metadata: {
            sessionId: 'session-id',
            reason: 'ADMIN_TERMINATION',
          },
        },
      });
    });
  });

  describe('revokeAll', () => {
    it('should revoke all active sessions for an identity', async () => {
      sessionUpdateMock.mockResolvedValue({ count: 3 });
      auditLogCreateMock.mockResolvedValue({ id: 'audit-id' });

      const result = await service.revokeAll('identity-id');

      expect(result).toBe(3);

      const updateArguments = sessionUpdateMock.mock.calls[0]?.[0];

      expect(updateArguments?.where).toEqual({
        identityId: 'identity-id',
        revokedAt: null,
      });

      expect(updateArguments?.data.revokedAt).toBeInstanceOf(Date);

      expect(auditLogCreateMock).toHaveBeenCalledWith({
        data: {
          identityId: 'identity-id',
          eventType: 'SESSIONS_REVOKED',
          metadata: {
            reason: 'LOGOUT_ALL',
            revokedSessionCount: 3,
          },
        },
      });
    });

    it('should not affect sessions belonging to another identity', async () => {
      sessionUpdateMock.mockResolvedValue({ count: 0 });

      const result = await service.revokeAll('identity-id');

      expect(result).toBe(0);

      const updateArguments = sessionUpdateMock.mock.calls[0]?.[0];

      expect(updateArguments?.where).toEqual({
        identityId: 'identity-id',
        revokedAt: null,
      });

      expect(auditLogCreateMock).not.toHaveBeenCalled();
    });

    it('should be idempotent when all sessions are already revoked', async () => {
      sessionUpdateMock.mockResolvedValue({ count: 0 });

      await expect(service.revokeAll('identity-id')).resolves.toBe(0);

      expect(auditLogCreateMock).not.toHaveBeenCalled();
    });

    it('should use the supplied revocation reason', async () => {
      sessionUpdateMock.mockResolvedValue({ count: 2 });
      auditLogCreateMock.mockResolvedValue({ id: 'audit-id' });

      await service.revokeAll('identity-id', 'SECURITY_RESPONSE');

      expect(auditLogCreateMock).toHaveBeenCalledWith({
        data: {
          identityId: 'identity-id',
          eventType: 'SESSIONS_REVOKED',
          metadata: {
            reason: 'SECURITY_RESPONSE',
            revokedSessionCount: 2,
          },
        },
      });
    });

    it('should execute session revocation and audit logging in a transaction', async () => {
      sessionUpdateMock.mockResolvedValue({ count: 3 });
      auditLogCreateMock.mockResolvedValue({ id: 'audit-id' });

      await service.revokeAll('identity-id');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(sessionUpdateMock).toHaveBeenCalledTimes(1);
      expect(auditLogCreateMock).toHaveBeenCalledTimes(1);
    });

    it('should propagate an audit failure from the transaction', async () => {
      sessionUpdateMock.mockResolvedValue({ count: 3 });
      auditLogCreateMock.mockRejectedValue(new Error('Audit log failed'));

      await expect(service.revokeAll('identity-id')).rejects.toThrow(
        'Audit log failed',
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('revokeOtherSessions', () => {
    it('should revoke all other active sessions while preserving the current session', async () => {
      sessionUpdateMock.mockResolvedValue({ count: 2 });
      auditLogCreateMock.mockResolvedValue({ id: 'audit-id' });

      const result = await service.revokeOtherSessions(
        transactionClient,
        'identity-id',
        'current-session-id',
      );

      expect(result).toBe(2);

      const updateArguments = sessionUpdateMock.mock.calls[0]?.[0];

      expect(updateArguments?.where).toEqual({
        identityId: 'identity-id',
        id: {
          not: 'current-session-id',
        },
        revokedAt: null,
      });

      expect(updateArguments?.data.revokedAt).toBeInstanceOf(Date);

      expect(auditLogCreateMock).toHaveBeenCalledWith({
        data: {
          identityId: 'identity-id',
          eventType: 'SESSIONS_REVOKED',
          metadata: {
            reason: 'PASSWORD_CHANGED',
            revokedSessionCount: 2,
          },
        },
      });
    });

    it('should not create an audit log when there are no other active sessions', async () => {
      sessionUpdateMock.mockResolvedValue({ count: 0 });

      const result = await service.revokeOtherSessions(
        transactionClient,
        'identity-id',
        'current-session-id',
      );

      expect(result).toBe(0);
      expect(auditLogCreateMock).not.toHaveBeenCalled();
    });

    it('should propagate audit failures from the transaction', async () => {
      sessionUpdateMock.mockResolvedValue({ count: 2 });
      auditLogCreateMock.mockRejectedValue(new Error('Audit log failed'));

      await expect(
        service.revokeOtherSessions(
          transactionClient,
          'identity-id',
          'current-session-id',
        ),
      ).rejects.toThrow('Audit log failed');
    });
  });
});
