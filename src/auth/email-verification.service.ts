import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma/prisma.service';
import { NotificationService } from '../common/notifications/notification.service';
import { EmailVerificationRateLimitService } from './email-verification.rate-limit.service';

const VERIFICATION_TOKEN_BYTES = 32;
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly emailVerificationRateLimitService: EmailVerificationRateLimitService,
  ) {}

  generateVerificationToken(): string {
    return randomBytes(VERIFICATION_TOKEN_BYTES).toString('base64url');
  }

  hashVerificationToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  async createVerificationToken(identityId: string): Promise<string> {
    const token = this.generateVerificationToken();
    const tokenHash = this.hashVerificationToken(token);
    const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);

    await this.prisma.emailVerificationToken.create({
      data: {
        identityId,
        tokenHash,
        expiresAt,
      },
    });

    return token;
  }

  async requestVerification(email: string): Promise<{
    message: string;
  }> {
    const normalizedEmail = email.trim().toLowerCase();

    await this.emailVerificationRateLimitService.checkRequestLimit(
      normalizedEmail,
    );

    const identity = await this.prisma.identity.findUnique({
      where: {
        email: normalizedEmail,
      },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
      },
    });

    const message =
      'If an account exists for that email and is not yet verified, verification instructions have been sent.';

    if (!identity || identity.emailVerifiedAt) {
      return { message };
    }

    const verificationToken = await this.createVerificationToken(identity.id);

    await this.prisma.auditLog.create({
      data: {
        identityId: identity.id,
        eventType: 'EMAIL_VERIFICATION_REQUESTED',
        metadata: {
          email: identity.email,
        },
      },
    });

    await this.notificationService.sendEmailVerificationEmail({
      email: identity.email,
      verificationToken,
    });

    return { message };
  }

  async validateVerificationToken(token: string): Promise<{
    id: string;
    identityId: string;
    expiresAt: Date;
    usedAt: Date | null;
  }> {
    const tokenHash = this.hashVerificationToken(token);

    const verificationToken =
      await this.prisma.emailVerificationToken.findFirst({
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

    if (!verificationToken) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }

    return verificationToken;
  }

  async verifyEmail(token: string): Promise<void> {
    const verificationToken = await this.validateVerificationToken(token);

    await this.prisma.$transaction(async (tx) => {
      const tokenResult = await tx.emailVerificationToken.updateMany({
        where: {
          id: verificationToken.id,
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
        throw new UnauthorizedException(
          'Invalid or expired verification token',
        );
      }

      const identityResult = await tx.identity.updateMany({
        where: {
          id: verificationToken.identityId,
          emailVerifiedAt: null,
        },
        data: {
          emailVerifiedAt: new Date(),
        },
      });

      if (identityResult.count !== 1) {
        throw new UnauthorizedException('Email verification is unavailable');
      }

      await tx.auditLog.create({
        data: {
          identityId: verificationToken.identityId,
          eventType: 'EMAIL_VERIFIED',
          metadata: {
            verificationTokenId: verificationToken.id,
          },
        },
      });
    });
  }
}
