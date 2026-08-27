import { Injectable } from '@nestjs/common';

export interface PasswordResetNotification {
  email: string;
  resetToken: string;
}

@Injectable()
export class NotificationService {
  sendPasswordResetEmail(
    notification: PasswordResetNotification,
  ): Promise<void> {
    /*
     * Notification delivery is intentionally kept behind this boundary.
     *
     * The actual email provider will be integrated here later.
     * The raw reset token is accepted only for delivery and must never
     * be persisted or logged.
     */
    void notification;

    return Promise.resolve();
  }
}
