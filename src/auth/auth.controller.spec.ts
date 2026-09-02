import { AuthController } from './auth.controller';
import type { AuthenticatedRequest } from './guards/access-token.guard';

describe('AuthController', () => {
  let controller: AuthController;

  const authService = {
    register: jest.fn(),
    login: jest.fn(),
    logout: jest.fn(),
    logoutAll: jest.fn(),
    getIdentityEmail: jest.fn(),
  };

  const passwordRecoveryService = {
    requestReset: jest.fn(),
    resetPassword: jest.fn(),
  };

  const emailVerificationService = {
    verifyEmail: jest.fn(),
  };

  const invitationService = {
    acceptInvitation: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new AuthController(
      authService as never,
      passwordRecoveryService as never,
      emailVerificationService as never,
      invitationService as never,
    );
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

  it('should logout all sessions for the authenticated identity', async () => {
    authService.logoutAll.mockResolvedValue(3);

    const request = {
      user: {
        identityId: 'identity-id',
        sessionId: 'session-id',
      },
    } as AuthenticatedRequest;

    const result = await controller.logoutAll(request);

    expect(authService.logoutAll).toHaveBeenCalledWith('identity-id');
    expect(result).toEqual({
      revokedSessionCount: 3,
    });
  });

  it('should propagate logout-all failures', async () => {
    authService.logoutAll.mockRejectedValue(
      new Error('Session revocation failed'),
    );

    const request = {
      user: {
        identityId: 'identity-id',
        sessionId: 'session-id',
      },
    } as AuthenticatedRequest;

    await expect(controller.logoutAll(request)).rejects.toThrow(
      'Session revocation failed',
    );
  });

  describe('forgotPassword', () => {
    it('should delegate the password reset request to PasswordRecoveryService', async () => {
      passwordRecoveryService.requestReset.mockResolvedValue({
        message:
          'If an account exists for that email, password reset instructions have been sent.',
      });

      const dto = {
        email: 'user@example.com',
      };

      const result = await controller.forgotPassword(dto);

      expect(passwordRecoveryService.requestReset).toHaveBeenCalledWith(
        'user@example.com',
      );

      expect(result).toEqual({
        message:
          'If an account exists for that email, password reset instructions have been sent.',
      });
    });

    it('should propagate password recovery failures', async () => {
      const error = new Error('Notification failure');

      passwordRecoveryService.requestReset.mockRejectedValue(error);

      await expect(
        controller.forgotPassword({
          email: 'user@example.com',
        }),
      ).rejects.toThrow(error);

      expect(passwordRecoveryService.requestReset).toHaveBeenCalledWith(
        'user@example.com',
      );
    });
  });

  describe('resetPassword', () => {
    it('should delegate the password reset to PasswordRecoveryService', async () => {
      passwordRecoveryService.resetPassword.mockResolvedValue(undefined);

      const dto = {
        token: 'reset-token',
        password: 'NewPassword123!',
      };

      await expect(controller.resetPassword(dto)).resolves.toBeUndefined();

      expect(passwordRecoveryService.resetPassword).toHaveBeenCalledWith(
        'reset-token',
        'NewPassword123!',
      );
    });

    it('should propagate password reset failures', async () => {
      const error = new Error('Password reset failed');

      passwordRecoveryService.resetPassword.mockRejectedValue(error);

      await expect(
        controller.resetPassword({
          token: 'reset-token',
          password: 'NewPassword123!',
        }),
      ).rejects.toThrow(error);

      expect(passwordRecoveryService.resetPassword).toHaveBeenCalledWith(
        'reset-token',
        'NewPassword123!',
      );
    });

    it('should not expose authentication credentials after password reset', async () => {
      passwordRecoveryService.resetPassword.mockResolvedValue(undefined);

      const result = await controller.resetPassword({
        token: 'reset-token',
        password: 'NewPassword123!',
      });

      expect(result).toBeUndefined();
    });
  });

  describe('verifyEmail', () => {
    it('should delegate email verification to EmailVerificationService', async () => {
      emailVerificationService.verifyEmail.mockResolvedValue(undefined);

      const dto = {
        token: 'verification-token',
      };

      await expect(controller.verifyEmail(dto)).resolves.toBeUndefined();

      expect(emailVerificationService.verifyEmail).toHaveBeenCalledWith(
        'verification-token',
      );
    });

    it('should propagate email verification failures', async () => {
      const error = new Error('Email verification failed');

      emailVerificationService.verifyEmail.mockRejectedValue(error);

      await expect(
        controller.verifyEmail({
          token: 'verification-token',
        }),
      ).rejects.toThrow(error);

      expect(emailVerificationService.verifyEmail).toHaveBeenCalledWith(
        'verification-token',
      );
    });

    it('should not expose authentication credentials after email verification', async () => {
      emailVerificationService.verifyEmail.mockResolvedValue(undefined);

      const result = await controller.verifyEmail({
        token: 'verification-token',
      });

      expect(result).toBeUndefined();
    });
  });

  describe('acceptInvitation', () => {
    const request = {
      user: {
        identityId: 'identity-id',
        sessionId: 'session-id',
      },
    } as AuthenticatedRequest;

    const dto = {
      token: 'invitation-token',
    };

    it('should accept an invitation for the authenticated identity', async () => {
      authService.getIdentityEmail.mockResolvedValue('john@example.com');
      invitationService.acceptInvitation.mockResolvedValue(undefined);

      await expect(
        controller.acceptInvitation(dto, request),
      ).resolves.toBeUndefined();

      expect(authService.getIdentityEmail).toHaveBeenCalledWith('identity-id');

      expect(invitationService.acceptInvitation).toHaveBeenCalledWith(
        'invitation-token',
        'identity-id',
        'john@example.com',
      );
    });

    it('should propagate invitation acceptance failures', async () => {
      authService.getIdentityEmail.mockResolvedValue('john@example.com');

      const error = new Error('Invitation acceptance failed');

      invitationService.acceptInvitation.mockRejectedValue(error);

      await expect(controller.acceptInvitation(dto, request)).rejects.toThrow(
        error,
      );

      expect(invitationService.acceptInvitation).toHaveBeenCalledWith(
        'invitation-token',
        'identity-id',
        'john@example.com',
      );
    });
  });
});
