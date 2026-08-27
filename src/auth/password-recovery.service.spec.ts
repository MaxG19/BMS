import { UnauthorizedException } from '@nestjs/common';
import { PasswordRecoveryService } from './password-recovery.service';

describe('PasswordRecoveryService', () => {
  let service: PasswordRecoveryService;

  type PasswordResetCreateArgs = {
    data: {
      identityId: string;
      tokenHash: string;
      expiresAt: Date;
    };
  };

  type PasswordResetFindFirstArgs = {
    where: {
      tokenHash: string;
      usedAt: null;
      expiresAt: {
        gt: Date;
      };
    };
    select: {
      id: true;
      identityId: true;
      expiresAt: true;
      usedAt: true;
    };
  };

  type PasswordResetUpdateArgs = {
    where: {
      id: string;
    };
    data: {
      usedAt: Date;
    };
  };

  type PasswordResetUpdateManyArgs = {
    where: {
      id: string;
      usedAt: null;
      expiresAt: {
        gt: Date;
      };
    };
    data: {
      usedAt: Date;
    };
  };

  type AuthenticationProviderUpdateManyArgs = {
    where: {
      identityId: string;
      providerType: string;
    };
    data: {
      passwordHash: string;
    };
  };

  type AuditLogCreateArgs = {
    data: {
      identityId: string;
      eventType: string;
      metadata: Record<string, unknown>;
    };
  };

  type PasswordResetCreateResult = {
    id: string;
  };

  type PasswordResetTokenResult = {
    id: string;
    identityId: string;
    expiresAt: Date;
    usedAt: Date | null;
  };

  const identityFindUniqueMock = jest.fn();

  const passwordResetCreateMock = jest.fn<
    Promise<PasswordResetCreateResult>,
    [PasswordResetCreateArgs]
  >();

  const passwordResetFindFirstMock = jest.fn<
    Promise<PasswordResetTokenResult | null>,
    [PasswordResetFindFirstArgs]
  >();

  const passwordResetUpdateMock = jest.fn<
    Promise<PasswordResetCreateResult>,
    [PasswordResetUpdateArgs]
  >();

  const passwordResetUpdateManyMock = jest.fn<
    Promise<{ count: number }>,
    [PasswordResetUpdateManyArgs]
  >();

  const authenticationProviderUpdateManyMock = jest.fn<
    Promise<{ count: number }>,
    [AuthenticationProviderUpdateManyArgs]
  >();

  const auditLogCreateMock = jest.fn<
    Promise<{ id: string }>,
    [AuditLogCreateArgs]
  >();

  const sendPasswordResetEmailMock = jest.fn<
    Promise<void>,
    [
      {
        email: string;
        resetToken: string;
      },
    ]
  >();

  const passwordHashService = {
    hash: jest.fn(),
    verify: jest.fn(),
  };

  const passwordPolicyService = {
    validate: jest.fn(),
  };

  const sessionRevocationService = {
    revokeAll: jest.fn(),
  };

  const passwordRecoveryRateLimitService = {
    checkRequestLimit: jest.fn(),
  };

  const transaction = jest.fn();

  const prisma = {
    identity: {
      findUnique: identityFindUniqueMock,
    },
    passwordResetToken: {
      create: passwordResetCreateMock,
      findFirst: passwordResetFindFirstMock,
      update: passwordResetUpdateMock,
      updateMany: passwordResetUpdateManyMock,
    },
    authenticationProvider: {
      updateMany: authenticationProviderUpdateManyMock,
    },
    auditLog: {
      create: auditLogCreateMock,
    },
    $transaction: transaction,
  };

  const notificationService = {
    sendPasswordResetEmail: sendPasswordResetEmailMock,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    passwordRecoveryRateLimitService.checkRequestLimit.mockResolvedValue(
      undefined,
    );

    transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => Promise<void>): Promise<void> =>
        callback(prisma),
    );

    service = new PasswordRecoveryService(
      prisma as never,
      notificationService,
      passwordHashService,
      passwordPolicyService,
      sessionRevocationService as never,
      passwordRecoveryRateLimitService as never,
    );
  });

  describe('generateResetToken', () => {
    it('should generate a cryptographically random token', () => {
      const first = service.generateResetToken();
      const second = service.generateResetToken();

      expect(first).not.toEqual(second);
      expect(first.length).toBeGreaterThan(30);
    });

    it('should hash tokens deterministically', () => {
      const token = 'reset-token';

      expect(service.hashResetToken(token)).toEqual(
        service.hashResetToken(token),
      );

      expect(service.hashResetToken(token)).not.toEqual(
        service.hashResetToken('another-token'),
      );
    });
  });

  describe('requestReset', () => {
    it('should create a reset token for an existing account', async () => {
      identityFindUniqueMock.mockResolvedValue({
        id: 'identity-id',
        email: 'user@example.com',
      });

      passwordResetCreateMock.mockResolvedValue({
        id: 'reset-id',
      });

      auditLogCreateMock.mockResolvedValue({
        id: 'audit-id',
      });

      sendPasswordResetEmailMock.mockResolvedValue(undefined);

      await expect(service.requestReset('user@example.com')).resolves.toEqual({
        message:
          'If an account exists for that email, password reset instructions have been sent.',
      });

      expect(passwordResetCreateMock).toHaveBeenCalledTimes(1);

      const createArgs = passwordResetCreateMock.mock.calls[0]?.[0];

      expect(createArgs).toBeDefined();
      expect(createArgs?.data.identityId).toBe('identity-id');
      expect(createArgs?.data.tokenHash).toEqual(expect.any(String));
      expect(createArgs?.data.expiresAt).toBeInstanceOf(Date);

      expect(auditLogCreateMock).toHaveBeenCalledWith({
        data: {
          identityId: 'identity-id',
          eventType: 'PASSWORD_RESET_REQUESTED',
          metadata: {
            email: 'user@example.com',
          },
        },
      });

      expect(sendPasswordResetEmailMock).toHaveBeenCalledTimes(1);

      const notificationArgs = sendPasswordResetEmailMock.mock.calls[0]?.[0];

      expect(notificationArgs).toBeDefined();
      expect(notificationArgs?.email).toBe('user@example.com');
      expect(notificationArgs?.resetToken).toEqual(expect.any(String));
    });

    it('should return the same response for an unknown email', async () => {
      identityFindUniqueMock.mockResolvedValue(null);

      await expect(
        service.requestReset('missing@example.com'),
      ).resolves.toEqual({
        message:
          'If an account exists for that email, password reset instructions have been sent.',
      });

      expect(passwordResetCreateMock).not.toHaveBeenCalled();
      expect(auditLogCreateMock).not.toHaveBeenCalled();
      expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();
    });

    it('should normalize email addresses before lookup', async () => {
      identityFindUniqueMock.mockResolvedValue(null);

      await service.requestReset(' USER@Example.COM ');

      expect(identityFindUniqueMock).toHaveBeenCalledWith({
        where: {
          email: 'user@example.com',
        },
        select: {
          id: true,
          email: true,
        },
      });
    });

    it('should enforce the password reset request rate limit', async () => {
      identityFindUniqueMock.mockResolvedValue(null);
      passwordRecoveryRateLimitService.checkRequestLimit.mockResolvedValue(
        undefined,
      );

      await service.requestReset('USER@example.com');

      expect(
        passwordRecoveryRateLimitService.checkRequestLimit,
      ).toHaveBeenCalledWith('user@example.com');

      expect(identityFindUniqueMock).toHaveBeenCalled();
    });

    it('should check the rate limit before looking up the identity', async () => {
      passwordRecoveryRateLimitService.checkRequestLimit.mockResolvedValue(
        undefined,
      );
      identityFindUniqueMock.mockResolvedValue(null);

      await service.requestReset(' USER@Example.COM ');

      expect(
        passwordRecoveryRateLimitService.checkRequestLimit,
      ).toHaveBeenCalledWith('user@example.com');

      expect(
        passwordRecoveryRateLimitService.checkRequestLimit.mock
          .invocationCallOrder[0],
      ).toBeLessThan(identityFindUniqueMock.mock.invocationCallOrder[0]);
    });

    it('should stop the reset request when the rate limit is exceeded', async () => {
      const rateLimitError = new Error('Too many requests');

      passwordRecoveryRateLimitService.checkRequestLimit.mockRejectedValue(
        rateLimitError,
      );

      await expect(service.requestReset('user@example.com')).rejects.toThrow(
        rateLimitError,
      );

      expect(identityFindUniqueMock).not.toHaveBeenCalled();
      expect(passwordResetCreateMock).not.toHaveBeenCalled();
      expect(auditLogCreateMock).not.toHaveBeenCalled();
      expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();
    });
  });

  describe('validateResetToken', () => {
    it('should validate an active reset token', async () => {
      passwordResetFindFirstMock.mockResolvedValue({
        id: 'reset-id',
        identityId: 'identity-id',
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
      });

      const result = await service.validateResetToken('reset-token');

      expect(result.identityId).toBe('identity-id');
    });

    it('should reject an invalid reset token', async () => {
      passwordResetFindFirstMock.mockResolvedValue(null);

      await expect(service.validateResetToken('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject an expired reset token', async () => {
      passwordResetFindFirstMock.mockResolvedValue(null);

      await expect(service.validateResetToken('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject a used reset token', async () => {
      passwordResetFindFirstMock.mockResolvedValue(null);

      await expect(service.validateResetToken('used-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('resetPassword', () => {
    const resetToken = {
      id: 'reset-id',
      identityId: 'identity-id',
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    };

    beforeEach(() => {
      passwordResetFindFirstMock.mockResolvedValue(resetToken);

      identityFindUniqueMock.mockResolvedValue({
        id: 'identity-id',
        email: 'user@example.com',
        name: 'Test User',
      });

      passwordHashService.hash.mockResolvedValue('new-password-hash');

      passwordPolicyService.validate.mockReturnValue(undefined);

      passwordResetUpdateManyMock.mockResolvedValue({
        count: 1,
      });

      authenticationProviderUpdateManyMock.mockResolvedValue({
        count: 1,
      });

      auditLogCreateMock.mockResolvedValue({
        id: 'audit-id',
      });

      sessionRevocationService.revokeAll.mockResolvedValue(2);
    });

    it('should validate the password and hash the new password', async () => {
      await service.resetPassword('reset-token', 'NewPassword123!');

      expect(passwordPolicyService.validate).toHaveBeenCalledWith(
        'NewPassword123!',
        {
          email: 'user@example.com',
          name: 'Test User',
        },
      );

      expect(passwordHashService.hash).toHaveBeenCalledWith('NewPassword123!');
    });

    it('should update the password credential', async () => {
      await service.resetPassword('reset-token', 'NewPassword123!');

      expect(authenticationProviderUpdateManyMock).toHaveBeenCalledWith({
        where: {
          identityId: 'identity-id',
          providerType: 'PASSWORD',
        },
        data: {
          passwordHash: 'new-password-hash',
        },
      });
    });

    it('should consume the reset token', async () => {
      await service.resetPassword('reset-token', 'NewPassword123!');

      expect(passwordResetUpdateManyMock).toHaveBeenCalledTimes(1);

      const updateArgs = passwordResetUpdateManyMock.mock.calls[0]?.[0];

      expect(updateArgs).toBeDefined();
      expect(updateArgs?.where.id).toBe('reset-id');
      expect(updateArgs?.where.usedAt).toBeNull();
      expect(updateArgs?.where.expiresAt.gt).toBeInstanceOf(Date);
      expect(updateArgs?.data.usedAt).toBeInstanceOf(Date);
    });

    it('should revoke all existing sessions after a successful reset', async () => {
      await service.resetPassword('reset-token', 'NewPassword123!');

      expect(sessionRevocationService.revokeAll).toHaveBeenCalledTimes(1);
      expect(sessionRevocationService.revokeAll).toHaveBeenCalledWith(
        'identity-id',
        'PASSWORD_RESET',
      );
    });

    it('should not revoke sessions when the reset transaction fails', async () => {
      authenticationProviderUpdateManyMock.mockRejectedValue(
        new Error('Database update failed'),
      );

      await expect(
        service.resetPassword('reset-token', 'NewPassword123!'),
      ).rejects.toThrow('Database update failed');

      expect(sessionRevocationService.revokeAll).not.toHaveBeenCalled();
    });

    it('should create a password reset completion audit log', async () => {
      await service.resetPassword('reset-token', 'NewPassword123!');

      expect(auditLogCreateMock).toHaveBeenCalledWith({
        data: {
          identityId: 'identity-id',
          eventType: 'PASSWORD_RESET_COMPLETED',
          metadata: {
            resetTokenId: 'reset-id',
          },
        },
      });
    });

    it('should reject an invalid or expired reset token', async () => {
      passwordResetFindFirstMock.mockResolvedValue(null);

      await expect(
        service.resetPassword('invalid-token', 'NewPassword123!'),
      ).rejects.toThrow(UnauthorizedException);

      expect(passwordHashService.hash).not.toHaveBeenCalled();
      expect(authenticationProviderUpdateManyMock).not.toHaveBeenCalled();
      expect(sessionRevocationService.revokeAll).not.toHaveBeenCalled();
    });

    it('should not change the password when password policy validation fails', async () => {
      const policyError = new Error('Password does not meet policy');

      passwordPolicyService.validate.mockImplementation(() => {
        throw policyError;
      });

      await expect(
        service.resetPassword('reset-token', 'weak-password'),
      ).rejects.toThrow(policyError);

      expect(passwordHashService.hash).not.toHaveBeenCalled();
      expect(passwordResetUpdateManyMock).not.toHaveBeenCalled();
      expect(authenticationProviderUpdateManyMock).not.toHaveBeenCalled();
      expect(sessionRevocationService.revokeAll).not.toHaveBeenCalled();
    });

    it('should reject when the reset token was already consumed', async () => {
      passwordResetUpdateManyMock.mockResolvedValue({
        count: 0,
      });

      await expect(
        service.resetPassword('reset-token', 'NewPassword123!'),
      ).rejects.toThrow(UnauthorizedException);

      expect(authenticationProviderUpdateManyMock).not.toHaveBeenCalled();
      expect(sessionRevocationService.revokeAll).not.toHaveBeenCalled();
    });

    it('should reject when password authentication is unavailable', async () => {
      authenticationProviderUpdateManyMock.mockResolvedValue({
        count: 0,
      });

      await expect(
        service.resetPassword('reset-token', 'NewPassword123!'),
      ).rejects.toThrow(UnauthorizedException);

      expect(sessionRevocationService.revokeAll).not.toHaveBeenCalled();
    });
  });

  describe('markTokenUsed', () => {
    it('should mark a reset token as used', async () => {
      passwordResetUpdateMock.mockResolvedValue({
        id: 'reset-id',
      });

      await service.markTokenUsed('reset-id');

      expect(passwordResetUpdateMock).toHaveBeenCalledTimes(1);

      const updateArgs = passwordResetUpdateMock.mock.calls[0]?.[0];

      expect(updateArgs).toBeDefined();
      expect(updateArgs?.where.id).toBe('reset-id');
      expect(updateArgs?.data.usedAt).toBeInstanceOf(Date);
    });
  });
});
