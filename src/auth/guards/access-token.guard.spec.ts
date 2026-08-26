import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AccessTokenGuard } from './access-token.guard';
import type { AuthenticatedRequest } from './access-token.guard';

describe('AccessTokenGuard', () => {
  let guard: AccessTokenGuard;

  const verificationService = {
    verify: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new AccessTokenGuard(verificationService as never);
  });

  function createContext(authorization?: string): ExecutionContext {
    const request = {
      headers: {
        authorization,
      },
      user: undefined,
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as never;
  }

  it('should authenticate a valid bearer token', async () => {
    verificationService.verify.mockResolvedValue({
      sub: 'identity-id',
      sid: 'session-id',
    });

    const context = createContext('Bearer access-token');

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(verificationService.verify).toHaveBeenCalledWith('access-token');

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    expect(request.user).toEqual({
      identityId: 'identity-id',
      sessionId: 'session-id',
    });
  });

  it('should reject a missing authorization header', async () => {
    const context = createContext();

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );

    expect(verificationService.verify).not.toHaveBeenCalled();
  });

  it('should reject a malformed authorization header', async () => {
    const context = createContext('Basic access-token');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );

    expect(verificationService.verify).not.toHaveBeenCalled();
  });

  it('should reject a bearer header without a token', async () => {
    const context = createContext('Bearer');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );

    expect(verificationService.verify).not.toHaveBeenCalled();
  });

  it('should reject an invalid access token', async () => {
    verificationService.verify.mockRejectedValue(
      new UnauthorizedException('Invalid or expired access token'),
    );

    const context = createContext('Bearer invalid-token');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );

    expect(verificationService.verify).toHaveBeenCalledWith('invalid-token');
  });
});
