import { AuthController } from './auth.controller';
import type { AuthenticatedRequest } from './guards/access-token.guard';

describe('AuthController', () => {
  let controller: AuthController;

  const authService = {
    register: jest.fn(),
    login: jest.fn(),
    logout: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new AuthController(authService as never);
  });

  it('should delegate registration to AuthService', async () => {
    const dto = {
      email: 'john@example.com',
      password: 'StrongPassword!123',
      name: 'John Doe',
    };

    const expectedResult = {
      id: 'identity-id',
      email: 'john@example.com',
    };

    authService.register.mockResolvedValue(expectedResult);

    const result = await controller.register(dto);

    expect(authService.register).toHaveBeenCalledWith(dto);
    expect(result).toEqual(expectedResult);
  });

  it('should delegate login to AuthService', async () => {
    const dto = {
      email: 'john@example.com',
      password: 'StrongPassword!123',
    };

    const expectedResult = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    };

    authService.login.mockResolvedValue(expectedResult);

    const result = await controller.login(dto);

    expect(authService.login).toHaveBeenCalledWith(dto);
    expect(result).toEqual(expectedResult);
  });

  it('should delegate logout using the authenticated identity and session', async () => {
    authService.logout.mockResolvedValue(undefined);

    const request = {
      user: {
        identityId: 'identity-id',
        sessionId: 'session-id',
      },
    } as AuthenticatedRequest;

    const result = await controller.logout(request);

    expect(authService.logout).toHaveBeenCalledWith(
      'identity-id',
      'session-id',
    );

    expect(result).toEqual({
      message: 'Logged out successfully',
    });
  });

  it('should not expose authentication data in the logout response', async () => {
    authService.logout.mockResolvedValue(undefined);

    const request = {
      user: {
        identityId: 'identity-id',
        sessionId: 'session-id',
      },
    } as AuthenticatedRequest;

    const result = await controller.logout(request);

    expect(result).not.toHaveProperty('accessToken');
    expect(result).not.toHaveProperty('refreshToken');
    expect(result).not.toHaveProperty('sessionId');
  });
});
