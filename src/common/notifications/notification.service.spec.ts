import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    service = new NotificationService();
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
});
