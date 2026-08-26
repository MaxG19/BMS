import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  const identity = {
    id: 'identity-id',
    email: 'john@example.com',
    name: 'John Doe',
    status: 'ACTIVE',
    createdAt: new Date(),
  };

  type CreateIdentityArgs = {
    data: {
      email: string;
      name: string;
      status: string;
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
  };

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

  const sessionUpdateMock = jest.fn<
    Promise<SessionUpdateResult>,
    [SessionUpdateArgs]
  >();

  type AuditLogCreateArgs = {
    data: {
      identityId: string;
      eventType: string;
      metadata: {
        sessionId: string;
      };
    };
  };

  const auditLogCreateMock = jest.fn<
    Promise<{ id: string }>,
    [AuditLogCreateArgs]
  >();

  const prisma = {
    identity: {
      findUnique: jest.fn(),
    },
    session: {
      updateMany: sessionUpdateMock,
    },
    auditLog: {
      create: auditLogCreateMock,
    },
    $transaction: jest.fn(
      (callback: (tx: typeof transactionClient) => Promise<typeof identity>) =>
        callback(transactionClient),
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

  beforeEach(() => {
    jest.clearAllMocks();
    createIdentityMock.mockResolvedValue(identity);

    service = new AuthService(
      prisma as never,
      passwordHashService,
      passwordPolicyService,
      refreshTokenService as never,
      accessTokenService as never,
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

    expect(result).toEqual({
      id: 'identity-id',
      email: 'john@example.com',
      name: 'John Doe',
      status: 'ACTIVE',
      createdAt: identity.createdAt,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
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

  it('should revoke the authenticated session', async () => {
    sessionUpdateMock.mockResolvedValue({
      count: 1,
    });

    await service.logout('identity-id', 'session-id');

    expect(sessionUpdateMock).toHaveBeenCalledTimes(1);

    const updateArguments = sessionUpdateMock.mock.calls[0]?.[0];

    expect(updateArguments).toBeDefined();
    expect(updateArguments?.where).toEqual({
      id: 'session-id',
      identityId: 'identity-id',
      revokedAt: null,
    });

    expect(updateArguments?.data.revokedAt).toBeInstanceOf(Date);
  });

  it('should reject logout when the session does not belong to the identity', async () => {
    sessionUpdateMock.mockResolvedValue({
      count: 0,
    });

    await expect(
      service.logout('identity-id', 'another-session-id'),
    ).rejects.toThrow(UnauthorizedException);

    expect(auditLogCreateMock).not.toHaveBeenCalled();
  });

  it('should create an audit log after successful logout', async () => {
    sessionUpdateMock.mockResolvedValue({
      count: 1,
    });

    auditLogCreateMock.mockResolvedValue({
      id: 'audit-id',
    });

    await service.logout('identity-id', 'session-id');

    expect(auditLogCreateMock).toHaveBeenCalledWith({
      data: {
        identityId: 'identity-id',
        eventType: 'LOGOUT',
        metadata: {
          sessionId: 'session-id',
        },
      },
    });
  });
});
