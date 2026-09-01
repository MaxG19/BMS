import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  const identity = {
    id: 'identity-id',
    email: 'john@example.com',
    name: 'John Doe',
    status: 'ACTIVE',
    emailVerifiedAt: new Date(),
    createdAt: new Date(),
  };

  type CreateIdentityArgs = {
    data: {
      email: string;
      name: string;
      status: string;
      emailVerifiedAt: Date | null;
      authenticationProviders: {
        create: {
          providerType: string;
          passwordHash: string;
        };
      };
    };
    select: Record<string, boolean>;
  };

  const createIdentityMock: jest.MockedFunction<
    (args: CreateIdentityArgs) => Promise<typeof identity>
  > = jest.fn();

  const transactionClient = {
    identity: {
      create: createIdentityMock,
    },
    authenticationProvider: {
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  const prisma = {
    identity: {
      findUnique: jest.fn(),
    },
    authenticationProvider: {
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(
      async (
        callback: (tx: typeof transactionClient) => Promise<void>,
      ): Promise<void> => callback(transactionClient),
    ),
  };

  const passwordHashService = {
    hash: jest.fn(),
    verify: jest.fn(),
  };

  const passwordPolicyService = {
    validate: jest.fn(),
  };

  const refreshTokenService = {
    createSession: jest.fn(),
  };

  const accessTokenService = {
    generate: jest.fn(),
  };

  const sessionRevocationService = {
    revokeRequired: jest.fn(),
    revokeAll: jest.fn(),
    revokeOtherSessions: jest.fn(),
  };

  const emailVerificationService = {
    createVerificationToken: jest.fn(),
  };

  const notificationService = {
    sendEmailVerificationEmail: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    passwordPolicyService.validate.mockImplementation(() => undefined);
    createIdentityMock.mockResolvedValue(identity);

    emailVerificationService.createVerificationToken.mockResolvedValue(
      'verification-token',
    );

    notificationService.sendEmailVerificationEmail.mockResolvedValue(undefined);

    service = new AuthService(
      prisma as never,
      passwordHashService,
      passwordPolicyService,
      refreshTokenService as never,
      accessTokenService as never,
      sessionRevocationService as never,
      emailVerificationService as never,
      notificationService as never,
    );
  });

  it('should reject registration when the email already exists', async () => {
    prisma.identity.findUnique.mockResolvedValue({
      id: 'existing-id',
    });

    await expect(
      service.register({
        email: 'john@example.com',
        password: 'StrongPassword!123',
        name: 'John Doe',
      }),
    ).rejects.toThrow(ConflictException);

    expect(passwordPolicyService.validate).not.toHaveBeenCalled();
    expect(passwordHashService.hash).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('should not create a duplicate identity when an invited email already has an identity', async () => {
    prisma.identity.findUnique.mockResolvedValue({
      id: 'existing-identity-id',
    });

    await expect(
      service.register({
        email: '  JOHN@EXAMPLE.COM  ',
        password: 'StrongPassword!123',
        name: 'John Doe',
      }),
    ).rejects.toThrow(ConflictException);

    expect(prisma.identity.findUnique).toHaveBeenCalledWith({
      where: {
        email: 'john@example.com',
      },
      select: {
        id: true,
      },
    });

    expect(createIdentityMock).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(
      emailVerificationService.createVerificationToken,
    ).not.toHaveBeenCalled();
    expect(
      notificationService.sendEmailVerificationEmail,
    ).not.toHaveBeenCalled();
  });

  it('should validate the password before hashing it', async () => {
    prisma.identity.findUnique.mockResolvedValue(null);
    passwordHashService.hash.mockResolvedValue('argon2-hash');

    await service.register({
      email: 'john@example.com',
      password: 'StrongPassword!123',
      name: 'John Doe',
    });

    expect(passwordPolicyService.validate).toHaveBeenCalledWith(
      'StrongPassword!123',
      {
        email: 'john@example.com',
        name: 'John Doe',
      },
    );

    expect(passwordHashService.hash).toHaveBeenCalledWith('StrongPassword!123');
  });

  it('should persist the password hash and never the plaintext password', async () => {
    prisma.identity.findUnique.mockResolvedValue(null);
    passwordHashService.hash.mockResolvedValue('argon2-hash');

    const password = 'StrongPassword!123';

    const result = await service.register({
      email: 'john@example.com',
      password,
      name: 'John Doe',
    });

    const createArguments = createIdentityMock.mock.calls[0]?.[0];

    expect(createArguments).toBeDefined();
    expect(createArguments?.data.authenticationProviders.create).toEqual({
      providerType: 'PASSWORD',
      passwordHash: 'argon2-hash',
    });

    expect(createArguments?.data.emailVerifiedAt).toBeNull();

    expect(JSON.stringify(createArguments)).not.toContain(password);
    expect(JSON.stringify(createArguments)).toContain('argon2-hash');

    expect(JSON.stringify(result)).not.toContain(password);
    expect(JSON.stringify(result)).not.toContain('argon2-hash');
  });

  it('should create the identity inside a transaction', async () => {
    prisma.identity.findUnique.mockResolvedValue(null);
    passwordHashService.hash.mockResolvedValue('argon2-hash');

    await service.register({
      email: 'john@example.com',
      password: 'StrongPassword!123',
      name: 'John Doe',
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(createIdentityMock).toHaveBeenCalledTimes(1);
  });

  it('should create an email verification token after registration', async () => {
    prisma.identity.findUnique.mockResolvedValue(null);
    passwordHashService.hash.mockResolvedValue('argon2-hash');

    await service.register({
      email: 'john@example.com',
      password: 'StrongPassword!123',
      name: 'John Doe',
    });

    expect(
      emailVerificationService.createVerificationToken,
    ).toHaveBeenCalledWith('identity-id');
  });

  it('should send the verification token through NotificationService', async () => {
    prisma.identity.findUnique.mockResolvedValue(null);
    passwordHashService.hash.mockResolvedValue('argon2-hash');

    await service.register({
      email: 'john@example.com',
      password: 'StrongPassword!123',
      name: 'John Doe',
    });

    expect(notificationService.sendEmailVerificationEmail).toHaveBeenCalledWith(
      {
        email: 'john@example.com',
        verificationToken: 'verification-token',
      },
    );
  });

  it('should create the verification token before sending the verification email', async () => {
    prisma.identity.findUnique.mockResolvedValue(null);
    passwordHashService.hash.mockResolvedValue('argon2-hash');

    const callOrder: string[] = [];

    emailVerificationService.createVerificationToken.mockImplementation(() => {
      callOrder.push('create-token');
      return Promise.resolve('verification-token');
    });

    notificationService.sendEmailVerificationEmail.mockImplementation(() => {
      callOrder.push('send-email');
      return Promise.resolve();
    });

    await service.register({
      email: 'john@example.com',
      password: 'StrongPassword!123',
      name: 'John Doe',
    });

    expect(callOrder).toEqual(['create-token', 'send-email']);
  });

  it('should not hash a password when password policy validation fails', async () => {
    prisma.identity.findUnique.mockResolvedValue(null);

    passwordPolicyService.validate.mockImplementation(() => {
      throw new Error('Password policy rejected');
    });

    await expect(
      service.register({
        email: 'john@example.com',
        password: 'WeakPassword',
        name: 'John Doe',
      }),
    ).rejects.toThrow('Password policy rejected');

    expect(passwordHashService.hash).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('should create a session and access token after successful login', async () => {
    prisma.identity.findUnique.mockResolvedValue({
      ...identity,
      emailVerifiedAt: new Date(),
      authenticationProviders: [
        {
          passwordHash: 'argon2-hash',
        },
      ],
    });

    passwordHashService.verify.mockResolvedValue(true);

    refreshTokenService.createSession.mockResolvedValue({
      token: 'refresh-token',
      session: {
        id: 'session-id',
        identityId: 'identity-id',
        createdAt: new Date(),
        lastActiveAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    accessTokenService.generate.mockResolvedValue('access-token');

    const result = await service.login({
      email: 'john@example.com',
      password: 'StrongPassword!123',
    });

    expect(refreshTokenService.createSession).toHaveBeenCalledWith(
      'identity-id',
    );

    expect(accessTokenService.generate).toHaveBeenCalledWith(
      'identity-id',
      'session-id',
    );

    expect(result).toMatchObject({
      id: 'identity-id',
      email: 'john@example.com',
      name: 'John Doe',
      status: 'ACTIVE',
      createdAt: identity.createdAt,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    expect(result.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('should reject an unverified account after successful password verification', async () => {
    prisma.identity.findUnique.mockResolvedValue({
      ...identity,
      emailVerifiedAt: null,
      authenticationProviders: [
        {
          passwordHash: 'argon2-hash',
        },
      ],
    });

    passwordHashService.verify.mockResolvedValue(true);

    await expect(
      service.login({
        email: 'john@example.com',
        password: 'StrongPassword!123',
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(passwordHashService.verify).toHaveBeenCalledWith(
      'StrongPassword!123',
      'argon2-hash',
    );

    expect(refreshTokenService.createSession).not.toHaveBeenCalled();
    expect(accessTokenService.generate).not.toHaveBeenCalled();
  });

  it('should reject invalid credentials before checking email verification status', async () => {
    prisma.identity.findUnique.mockResolvedValue({
      ...identity,
      emailVerifiedAt: null,
      authenticationProviders: [
        {
          passwordHash: 'argon2-hash',
        },
      ],
    });

    passwordHashService.verify.mockResolvedValue(false);

    await expect(
      service.login({
        email: 'john@example.com',
        password: 'WrongPassword!123',
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(passwordHashService.verify).toHaveBeenCalledWith(
      'WrongPassword!123',
      'argon2-hash',
    );

    expect(refreshTokenService.createSession).not.toHaveBeenCalled();
    expect(accessTokenService.generate).not.toHaveBeenCalled();
  });

  it('should reject invalid credentials without creating a session', async () => {
    prisma.identity.findUnique.mockResolvedValue({
      ...identity,
      authenticationProviders: [
        {
          passwordHash: 'argon2-hash',
        },
      ],
    });

    passwordHashService.verify.mockResolvedValue(false);

    await expect(
      service.login({
        email: 'john@example.com',
        password: 'WrongPassword!123',
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(refreshTokenService.createSession).not.toHaveBeenCalled();
    expect(accessTokenService.generate).not.toHaveBeenCalled();
  });

  it('should reject a nonexistent account without creating a session', async () => {
    prisma.identity.findUnique.mockResolvedValue(null);

    await expect(
      service.login({
        email: 'unknown@example.com',
        password: 'StrongPassword!123',
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(refreshTokenService.createSession).not.toHaveBeenCalled();
    expect(accessTokenService.generate).not.toHaveBeenCalled();
  });

  it('should revoke the authenticated session through SessionRevocationService', async () => {
    sessionRevocationService.revokeRequired.mockResolvedValue(undefined);

    await service.logout('identity-id', 'session-id');

    expect(sessionRevocationService.revokeRequired).toHaveBeenCalledWith(
      'session-id',
      'identity-id',
      'USER_LOGOUT',
    );
  });

  it('should propagate session revocation failures', async () => {
    sessionRevocationService.revokeRequired.mockRejectedValue(
      new UnauthorizedException('Invalid or expired session'),
    );

    await expect(service.logout('identity-id', 'session-id')).rejects.toThrow(
      'Invalid or expired session',
    );
  });

  it('should revoke all sessions through SessionRevocationService', async () => {
    sessionRevocationService.revokeAll.mockResolvedValue(3);

    const result = await service.logoutAll('identity-id');

    expect(result).toBe(3);

    expect(sessionRevocationService.revokeAll).toHaveBeenCalledWith(
      'identity-id',
      'LOGOUT_ALL',
    );
  });

  it('should propagate logout-all revocation failures', async () => {
    sessionRevocationService.revokeAll.mockRejectedValue(
      new Error('Session revocation failed'),
    );

    await expect(service.logoutAll('identity-id')).rejects.toThrow(
      'Session revocation failed',
    );
  });

  describe('changePassword', () => {
    const passwordProvider = {
      id: 'provider-id',
      passwordHash: 'old-argon2-hash',
    };

    beforeEach(() => {
      prisma.identity.findUnique.mockResolvedValue({
        ...identity,
        authenticationProviders: [passwordProvider],
      });

      passwordHashService.verify.mockResolvedValue(true);
      passwordHashService.hash.mockResolvedValue('new-argon2-hash');

      prisma.authenticationProvider.update.mockResolvedValue({
        ...passwordProvider,
        passwordHash: 'new-argon2-hash',
      });

      prisma.auditLog.create.mockResolvedValue({
        id: 'audit-id',
      });

      sessionRevocationService.revokeOtherSessions.mockResolvedValue(2);
    });

    it('should change the password inside a transaction', async () => {
      await service.changePassword(
        'identity-id',
        'current-session-id',
        'OldPassword!123',
        'NewPassword!456',
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      expect(passwordHashService.verify).toHaveBeenCalledWith(
        'OldPassword!123',
        'old-argon2-hash',
      );

      expect(passwordPolicyService.validate).toHaveBeenCalledWith(
        'NewPassword!456',
        {
          email: 'john@example.com',
          name: 'John Doe',
        },
      );

      expect(passwordHashService.hash).toHaveBeenCalledWith('NewPassword!456');

      expect(
        transactionClient.authenticationProvider.update,
      ).toHaveBeenCalledWith({
        where: {
          id: 'provider-id',
        },
        data: {
          passwordHash: 'new-argon2-hash',
        },
      });

      expect(sessionRevocationService.revokeOtherSessions).toHaveBeenCalledWith(
        transactionClient,
        'identity-id',
        'current-session-id',
      );

      expect(transactionClient.auditLog.create).toHaveBeenCalledWith({
        data: {
          identityId: 'identity-id',
          eventType: 'PASSWORD_CHANGED',
          metadata: {
            currentSessionId: 'current-session-id',
          },
        },
      });
    });

    it('should reject an incorrect current password before changing anything', async () => {
      passwordHashService.verify.mockResolvedValue(false);

      await expect(
        service.changePassword(
          'identity-id',
          'current-session-id',
          'WrongPassword!123',
          'NewPassword!456',
        ),
      ).rejects.toThrow(UnauthorizedException);

      expect(passwordHashService.hash).not.toHaveBeenCalled();
      expect(
        transactionClient.authenticationProvider.update,
      ).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(
        sessionRevocationService.revokeOtherSessions,
      ).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('should reject an inactive identity', async () => {
      prisma.identity.findUnique.mockResolvedValue({
        ...identity,
        status: 'SUSPENDED',
        authenticationProviders: [passwordProvider],
      });

      await expect(
        service.changePassword(
          'identity-id',
          'current-session-id',
          'OldPassword!123',
          'NewPassword!456',
        ),
      ).rejects.toThrow(UnauthorizedException);

      expect(passwordHashService.verify).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should reject an identity without a password provider', async () => {
      prisma.identity.findUnique.mockResolvedValue({
        ...identity,
        authenticationProviders: [],
      });

      await expect(
        service.changePassword(
          'identity-id',
          'current-session-id',
          'OldPassword!123',
          'NewPassword!456',
        ),
      ).rejects.toThrow(UnauthorizedException);

      expect(passwordHashService.verify).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should validate the new password before hashing it', async () => {
      passwordPolicyService.validate.mockImplementation(() => {
        throw new Error('Password policy rejected');
      });

      await expect(
        service.changePassword(
          'identity-id',
          'current-session-id',
          'OldPassword!123',
          'WeakPassword',
        ),
      ).rejects.toThrow('Password policy rejected');

      expect(passwordHashService.hash).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(
        sessionRevocationService.revokeOtherSessions,
      ).not.toHaveBeenCalled();
    });

    it('should propagate transaction failures', async () => {
      prisma.$transaction.mockRejectedValue(
        new Error('Password change transaction failed'),
      );

      await expect(
        service.changePassword(
          'identity-id',
          'current-session-id',
          'OldPassword!123',
          'NewPassword!456',
        ),
      ).rejects.toThrow('Password change transaction failed');

      expect(
        transactionClient.authenticationProvider.update,
      ).not.toHaveBeenCalled();
    });
  });
});
