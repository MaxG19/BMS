import { Injectable } from '@nestjs/common';

export interface PasswordResetNotification {
  email: string;
  resetToken: string;
}

export interface EmailVerificationNotification {
  email: string;
  verificationToken: string;
}

export interface InvitationNotification {
  email: string;
  invitationToken: string;
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

  sendEmailVerificationEmail(
    notification: EmailVerificationNotification,
  ): Promise<void> {
    /*
     * Notification delivery is intentionally kept behind this boundary.
     *
     * The actual email provider will be integrated here later.
     * The raw verification token is accepted only for delivery and must never
     * be persisted or logged.
     */
    void notification;

    return Promise.resolve();
  }

  sendInvitationEmail(notification: InvitationNotification): Promise<void> {
    /*
     * Notification delivery is intentionally kept behind this boundary.
     *
     * The actual email provider will be integrated here later.
     * The raw invitation token is accepted only for delivery and must never
     * be persisted or logged.
     */
    void notification;

    return Promise.resolve();
  }
}
