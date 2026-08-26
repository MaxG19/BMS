import { SessionRevocationService } from './session-revocation.service';

describe('SessionRevocationService', () => {
  let service: SessionRevocationService;

  type SessionUpdateArgs = {
    where: {
      id: string;
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
        sessionId: string;
        reason: string;
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

  const prisma = {
    session: {
      updateMany: sessionUpdateMock,
    },
    auditLog: {
      create: auditLogCreateMock,
    },
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
});
