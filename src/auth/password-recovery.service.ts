import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma/prisma.service';
import { NotificationService } from '../common/notifications/notification.service';
import { PasswordHashService } from './password-hash.service';
import { PasswordPolicyService } from './password-policy.service';
import { SessionRevocationService } from './session-revocation.service';
import { PasswordRecoveryRateLimitService } from './password-recovery.rate-limit.service';

const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class PasswordRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly passwordHashService: PasswordHashService,
    private readonly passwordPolicyService: PasswordPolicyService,
    private readonly sessionRevocationService: SessionRevocationService,
    private readonly passwordRecoveryRateLimitService: PasswordRecoveryRateLimitService,
  ) {}

  generateResetToken(): string {
    return randomBytes(RESET_TOKEN_BYTES).toString('base64url');
  }

  hashResetToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  async requestReset(email: string): Promise<{
    message: string;
  }> {
    const normalizedEmail = email.trim().toLowerCase();

    await this.passwordRecoveryRateLimitService.checkRequestLimit(
      normalizedEmail,
    );

    const identity = await this.prisma.identity.findUnique({
      where: {
        email: normalizedEmail,
      },
      select: {
        id: true,
        email: true,
      },
    });

    const message =
      'If an account exists for that email, password reset instructions have been sent.';

    if (!identity) {
      return { message };
    }

    const token = this.generateResetToken();
    const tokenHash = this.hashResetToken(token);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await this.prisma.passwordResetToken.create({
      data: {
        identityId: identity.id,
        tokenHash,
        expiresAt,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        identityId: identity.id,
        eventType: 'PASSWORD_RESET_REQUESTED',
        metadata: {
          email: identity.email,
        },
      },
    });

    await this.notificationService.sendPasswordResetEmail({
      email: identity.email,
      resetToken: token,
    });

    return { message };
  }

  async validateResetToken(token: string): Promise<{
    id: string;
    identityId: string;
    expiresAt: Date;
    usedAt: Date | null;
  }> {
    const tokenHash = this.hashResetToken(token);

    const resetToken = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      select: {
        id: true,
        identityId: true,
        expiresAt: true,
        usedAt: true,
      },
    });

    if (!resetToken) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    return resetToken;
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const resetToken = await this.validateResetToken(token);

    const identity = await this.prisma.identity.findUnique({
      where: {
        id: resetToken.identityId,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    if (!identity) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    this.passwordPolicyService.validate(newPassword, {
      email: identity.email,
      name: identity.name,
    });

    const passwordHash = await this.passwordHashService.hash(newPassword);

    await this.prisma.$transaction(async (tx) => {
      const tokenResult = await tx.passwordResetToken.updateMany({
        where: {
          id: resetToken.id,
          usedAt: null,
          expiresAt: {
            gt: new Date(),
          },
        },
        data: {
          usedAt: new Date(),
        },
      });

      if (tokenResult.count !== 1) {
        throw new UnauthorizedException('Invalid or expired reset token');
      }

      const providerResult = await tx.authenticationProvider.updateMany({
        where: {
          identityId: identity.id,
          providerType: 'PASSWORD',
        },
        data: {
          passwordHash,
        },
      });

      if (providerResult.count !== 1) {
        throw new UnauthorizedException(
          'Password authentication is unavailable',
        );
      }

      await tx.auditLog.create({
        data: {
          identityId: identity.id,
          eventType: 'PASSWORD_RESET_COMPLETED',
          metadata: {
            resetTokenId: resetToken.id,
          },
        },
      });
    });

    await this.sessionRevocationService.revokeAll(
      identity.id,
      'PASSWORD_RESET',
    );
  }

  async markTokenUsed(resetTokenId: string): Promise<void> {
    await this.prisma.passwordResetToken.update({
      where: {
        id: resetTokenId,
      },
      data: {
        usedAt: new Date(),
      },
    });
  }
}
