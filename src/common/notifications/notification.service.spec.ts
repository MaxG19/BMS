import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    service = new NotificationService();
  });

  it('should accept invitation email notifications', async () => {
    const notification = {
      email: 'john@example.com',
      invitationToken: 'invitation-token',
    };

    await expect(
      service.sendInvitationEmail(notification),
    ).resolves.toBeUndefined();
  });

  describe('sendPasswordResetEmail', () => {
    it('should accept a password reset notification', async () => {
      await expect(
        service.sendPasswordResetEmail({
          email: 'user@example.com',
          resetToken: 'reset-token',
        }),
      ).resolves.toBeUndefined();
    });

    it('should not expose the reset token through a return value', async () => {
      const result = await service.sendPasswordResetEmail({
        email: 'user@example.com',
        resetToken: 'reset-token',
      });

      expect(result).toBeUndefined();
    });
  });

  describe('sendEmailVerificationEmail', () => {
    it('should accept an email verification notification', async () => {
      await expect(
        service.sendEmailVerificationEmail({
          email: 'john@example.com',
          verificationToken: 'verification-token',
        }),
      ).resolves.toBeUndefined();
    });
  });
});
