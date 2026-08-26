import { UnauthorizedException } from '@nestjs/common';
import { RefreshTokenService } from './refresh-token.service';

describe('RefreshTokenService', () => {
  let service: RefreshTokenService;

  const session = {
    id: 'session-id',
    identityId: 'identity-id',
    createdAt: new Date(),
    lastActiveAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    revokedAt: null,
  };

  const validatedSession = {
    id: session.id,
    identityId: session.identityId,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt,
  };

  type SessionCreateArgs = {
    data: {
      identityId: string;
      refreshTokenHash: string;
      userAgent?: string;
      ipAddress?: string;
      expiresAt: Date;
    };
    select: {
      id: boolean;
      identityId: boolean;
      createdAt: boolean;
      lastActiveAt: boolean;
      expiresAt: boolean;
    };
  };

  type SessionFindFirstArgs = {
    where: {
      refreshTokenHash: string;
      revokedAt: null;
      expiresAt: {
        gt: Date;
      };
    };
    select: {
      id: boolean;
      identityId: boolean;
      expiresAt: boolean;
      revokedAt: boolean;
    };
  };

  const createMock = jest.fn<Promise<typeof session>, [SessionCreateArgs]>();

  type ValidatedSession = {
    id: string;
    identityId: string;
    expiresAt: Date;
    revokedAt: Date | null;
  };

  const findFirstMock = jest.fn<
    Promise<ValidatedSession | null>,
    [SessionFindFirstArgs]
  >();

  const prisma = {
    session: {
      create: createMock,
      findFirst: findFirstMock,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RefreshTokenService(prisma as never);
  });

  it('should generate a cryptographically random refresh token', () => {
    const firstToken = service.generateToken();
    const secondToken = service.generateToken();

    expect(firstToken).toBeDefined();
    expect(secondToken).toBeDefined();
    expect(firstToken).not.toBe(secondToken);
    expect(firstToken.length).toBeGreaterThanOrEqual(40);
  });

  it('should produce a deterministic SHA-256 hash', () => {
    const token = service.generateToken();

    const firstHash = service.hashToken(token);
    const secondHash = service.hashToken(token);

    expect(firstHash).toBe(secondHash);
    expect(firstHash).toMatch(/^[a-f0-9]{64}$/);
    expect(firstHash).not.toBe(token);
  });

  it('should create a session using only the refresh token hash', async () => {
    createMock.mockResolvedValue(session);

    const result = await service.createSession('identity-id', {
      userAgent: 'Test Browser',
      ipAddress: '127.0.0.1',
    });

    expect(result.token).toBeDefined();
    expect(result.token).not.toBe(result.session.id);

    expect(createMock).toHaveBeenCalledTimes(1);

    const createCall: SessionCreateArgs = createMock.mock.calls[0][0];

    expect(createCall).toBeDefined();
    expect(createCall.data.identityId).toBe('identity-id');
    expect(createCall.data.refreshTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createCall.data.refreshTokenHash).not.toBe(result.token);
    expect(createCall.data.userAgent).toBe('Test Browser');
    expect(createCall.data.ipAddress).toBe('127.0.0.1');
    expect(createCall.data.expiresAt).toBeInstanceOf(Date);
  });

  it('should set refresh-token expiry to seven days', async () => {
    createMock.mockResolvedValue(session);

    const before = Date.now();

    await service.createSession('identity-id');

    const after = Date.now();

    const createCall: SessionCreateArgs = createMock.mock.calls[0][0];

    expect(createCall).toBeDefined();
    const expiresAt = createCall.data.expiresAt.getTime();

    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    expect(expiresAt).toBeGreaterThanOrEqual(before + sevenDays);
    expect(expiresAt).toBeLessThanOrEqual(after + sevenDays);
  });

  it('should validate an active refresh token', async () => {
    const token = 'valid-refresh-token';

    findFirstMock.mockResolvedValue(validatedSession);

    const result = await service.validateToken(token);

    expect(result).toEqual(validatedSession);

    expect(findFirstMock).toHaveBeenCalledTimes(1);

    const findFirstCall: SessionFindFirstArgs = findFirstMock.mock.calls[0][0];

    expect(findFirstCall.where.refreshTokenHash).toBe(service.hashToken(token));
    expect(findFirstCall.where.revokedAt).toBeNull();
    expect(findFirstCall.where.expiresAt.gt).toBeInstanceOf(Date);

    expect(findFirstCall.select).toEqual({
      id: true,
      identityId: true,
      expiresAt: true,
      revokedAt: true,
    });
  });

  it('should reject an invalid or expired refresh token', async () => {
    findFirstMock.mockResolvedValue(null);

    await expect(
      service.validateToken('invalid-refresh-token'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should never expose the refresh token through the session record', async () => {
    createMock.mockResolvedValue(session);

    const result = await service.createSession('identity-id');

    expect(result.session).not.toHaveProperty('refreshToken');
    expect(result.session).not.toHaveProperty('refreshTokenHash');
  });
});
