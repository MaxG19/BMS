import { UnauthorizedException } from '@nestjs/common';
import { RefreshTokenService } from './refresh-token.service';
import { SessionPolicyService } from './session-policy.service';
import { SessionRevocationService } from './session-revocation.service';

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
    createdAt: session.createdAt,
    lastActiveAt: session.lastActiveAt,
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
    };
    select: {
      id: boolean;
      identityId: boolean;
      createdAt: boolean;
      lastActiveAt: boolean;
      expiresAt: boolean;
      revokedAt: boolean;
    };
  };

  type SessionUpdateManyArgs = {
    where: {
      id: string;
      refreshTokenHash: string;
      revokedAt: null;
      expiresAt: {
        gt: Date;
      };
    };
    data: {
      refreshTokenHash: string;
      lastActiveAt: Date;
    };
  };

  const createMock = jest.fn<Promise<typeof session>, [SessionCreateArgs]>();

  type ValidatedSession = {
    id: string;
    identityId: string;
    createdAt: Date;
    lastActiveAt: Date;
    expiresAt: Date;
    revokedAt: Date | null;
  };

  const findFirstMock = jest.fn<
    Promise<ValidatedSession | null>,
    [SessionFindFirstArgs]
  >();

  const updateManyMock = jest.fn<
    Promise<{ count: number }>,
    [SessionUpdateManyArgs]
  >();

  const prisma = {
    session: {
      create: createMock,
      findFirst: findFirstMock,
      updateMany: updateManyMock,
    },
  };

  const generateAccessTokenMock = jest.fn<Promise<string>, [string, string]>();

  const accessTokenService = {
    generate: generateAccessTokenMock,
  };

  const sessionPolicyService: jest.Mocked<
    Pick<SessionPolicyService, 'isAbsolutelyExpired' | 'isIdle'>
  > = {
    isAbsolutelyExpired: jest.fn(),
    isIdle: jest.fn(),
  };

  const sessionRevocationService: jest.Mocked<
    Pick<SessionRevocationService, 'revoke'>
  > = {
    revoke: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RefreshTokenService(
      prisma as never,
      accessTokenService as never,
      sessionPolicyService as never,
      sessionRevocationService as never,
    );
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
    sessionPolicyService.isAbsolutelyExpired.mockReturnValue(false);
    sessionPolicyService.isIdle.mockReturnValue(false);

    const result = await service.validateToken(token);

    expect(result).toEqual({
      id: session.id,
      identityId: session.identityId,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
    });

    expect(findFirstMock).toHaveBeenCalledTimes(1);

    const findFirstCall: SessionFindFirstArgs = findFirstMock.mock.calls[0][0];

    expect(findFirstCall.where.refreshTokenHash).toBe(service.hashToken(token));
    expect(findFirstCall.where.revokedAt).toBeNull();

    expect(findFirstCall.select).toEqual({
      id: true,
      identityId: true,
      createdAt: true,
      lastActiveAt: true,
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

  it('should rotate a valid refresh token', async () => {
    const oldRefreshToken = 'old-refresh-token';
    const newAccessToken = 'new-access-token';

    findFirstMock.mockResolvedValue(validatedSession);
    sessionPolicyService.isAbsolutelyExpired.mockReturnValue(false);
    sessionPolicyService.isIdle.mockReturnValue(false);
    updateManyMock.mockResolvedValue({ count: 1 });
    generateAccessTokenMock.mockResolvedValue(newAccessToken);

    const result = await service.rotateToken(oldRefreshToken);

    expect(result.accessToken).toBe(newAccessToken);
    expect(result.refreshToken).toBeDefined();
    expect(result.refreshToken).not.toBe(oldRefreshToken);

    expect(findFirstMock).toHaveBeenCalledTimes(1);
    expect(updateManyMock).toHaveBeenCalledTimes(1);
    expect(generateAccessTokenMock).toHaveBeenCalledWith(
      'identity-id',
      'session-id',
    );

    const updateCall: SessionUpdateManyArgs = updateManyMock.mock.calls[0][0];

    expect(updateCall.where.id).toBe('session-id');
    expect(updateCall.where.refreshTokenHash).toBe(
      service.hashToken(oldRefreshToken),
    );
    expect(updateCall.where.revokedAt).toBeNull();
    expect(updateCall.where.expiresAt.gt).toBeInstanceOf(Date);

    expect(updateCall.data.refreshTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(updateCall.data.refreshTokenHash).not.toBe(oldRefreshToken);
    expect(updateCall.data.lastActiveAt).toBeInstanceOf(Date);
  });

  it('should reject rotation when the refresh token is invalid', async () => {
    findFirstMock.mockResolvedValue(null);

    await expect(service.rotateToken('invalid-refresh-token')).rejects.toThrow(
      UnauthorizedException,
    );

    expect(updateManyMock).not.toHaveBeenCalled();
    expect(generateAccessTokenMock).not.toHaveBeenCalled();
  });

  it('should reject a refresh token when the session is idle', async () => {
    findFirstMock.mockResolvedValue({
      id: session.id,
      identityId: session.identityId,
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
    });

    sessionPolicyService.isAbsolutelyExpired.mockReturnValue(false);
    sessionPolicyService.isIdle.mockReturnValue(true);
    sessionRevocationService.revoke.mockResolvedValue(undefined);

    await expect(service.validateToken('refresh-token')).rejects.toThrow(
      UnauthorizedException,
    );

    expect(sessionRevocationService.revoke).toHaveBeenCalledWith(
      session.id,
      session.identityId,
      expect.any(String),
    );
  });

  it('should accept a refresh token when the session is active', async () => {
    findFirstMock.mockResolvedValue({
      id: session.id,
      identityId: session.identityId,
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
    });

    sessionPolicyService.isAbsolutelyExpired.mockReturnValue(false);
    sessionPolicyService.isIdle.mockReturnValue(false);

    const result = await service.validateToken('refresh-token');

    expect(result).toEqual({
      id: session.id,
      identityId: session.identityId,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
    });

    expect(sessionRevocationService.revoke).not.toHaveBeenCalled();
  });

  it('should reject a refresh token when no active session exists', async () => {
    findFirstMock.mockResolvedValue(null);

    await expect(service.validateToken('refresh-token')).rejects.toThrow(
      UnauthorizedException,
    );

    expect(sessionPolicyService.isAbsolutelyExpired).not.toHaveBeenCalled();
    expect(sessionPolicyService.isIdle).not.toHaveBeenCalled();
    expect(sessionRevocationService.revoke).not.toHaveBeenCalled();
  });

  it('should reject rotation when the session has expired by policy', async () => {
    findFirstMock.mockResolvedValue({
      id: session.id,
      identityId: session.identityId,
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
    });

    sessionPolicyService.isAbsolutelyExpired.mockReturnValue(false);
    sessionPolicyService.isIdle.mockReturnValue(true);
    sessionRevocationService.revoke.mockResolvedValue(undefined);

    await expect(service.rotateToken('refresh-token')).rejects.toThrow(
      UnauthorizedException,
    );

    expect(sessionRevocationService.revoke).toHaveBeenCalledWith(
      session.id,
      session.identityId,
      expect.any(String),
    );
  });

  it('should reject rotation when the session was already rotated', async () => {
    findFirstMock.mockResolvedValue(validatedSession);
    sessionPolicyService.isAbsolutelyExpired.mockReturnValue(false);
    sessionPolicyService.isIdle.mockReturnValue(false);
    updateManyMock.mockResolvedValue({ count: 0 });

    await expect(
      service.rotateToken('already-used-refresh-token'),
    ).rejects.toThrow(UnauthorizedException);

    expect(generateAccessTokenMock).not.toHaveBeenCalled();
  });
});
