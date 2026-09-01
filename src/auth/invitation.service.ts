import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma/prisma.service';
import { NotificationService } from '../common/notifications/notification.service';

const INVITATION_TOKEN_BYTES = 32;
const INVITATION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const INVITATION_PENDING = 'PENDING';
const INVITATION_ACCEPTED = 'ACCEPTED';
const INVITATION_REVOKED = 'REVOKED';

@Injectable()
export class InvitationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  generateInvitationToken(): string {
    return randomBytes(INVITATION_TOKEN_BYTES).toString('base64url');
  }

  hashInvitationToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  async createInvitation(
    businessId: string,
    roleId: string,
    email: string,
  ): Promise<{
    message: string;
  }> {
    const normalizedEmail = this.normalizeEmail(email);

    const token = this.generateInvitationToken();
    const tokenHash = this.hashInvitationToken(token);
    const expiresAt = new Date(Date.now() + INVITATION_TOKEN_TTL_MS);

    const invitation = await this.prisma.$transaction(async (tx) => {
      const existingInvitation = await tx.invitation.findFirst({
        where: {
          businessId,
          email: normalizedEmail,
          status: INVITATION_PENDING,
          revokedAt: null,
          acceptedAt: null,
          expiresAt: {
            gt: new Date(),
          },
        },
        select: {
          id: true,
        },
      });

      if (existingInvitation) {
        throw new ConflictException(
          'A pending invitation already exists for this email',
        );
      }

      const createdInvitation = await tx.invitation.create({
        data: {
          businessId,
          roleId,
          email: normalizedEmail,
          tokenHash,
          status: INVITATION_PENDING,
          expiresAt,
        },
        select: {
          id: true,
          email: true,
        },
      });

      await tx.auditLog.create({
        data: {
          eventType: 'INVITATION_CREATED',
          metadata: {
            invitationId: createdInvitation.id,
            businessId,
            roleId,
            email: normalizedEmail,
          },
        },
      });

      return createdInvitation;
    });

    await this.notificationService.sendInvitationEmail({
      email: invitation.email,
      invitationToken: token,
    });

    return {
      message: 'Invitation sent successfully',
    };
  }

  async validateInvitationToken(token: string): Promise<{
    id: string;
    businessId: string;
    roleId: string;
    email: string;
    expiresAt: Date;
    acceptedAt: Date | null;
    revokedAt: Date | null;
  }> {
    const tokenHash = this.hashInvitationToken(token);

    const invitation = await this.prisma.invitation.findFirst({
      where: {
        tokenHash,
        status: INVITATION_PENDING,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      select: {
        id: true,
        businessId: true,
        roleId: true,
        email: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
      },
    });

    if (!invitation) {
      throw new UnauthorizedException('Invalid or expired invitation');
    }

    return invitation;
  }

  async acceptInvitation(
    token: string,
    identityId: string,
    identityEmail: string,
  ): Promise<void> {
    const invitation = await this.validateInvitationToken(token);

    const normalizedIdentityEmail = this.normalizeEmail(identityEmail);

    if (invitation.email !== normalizedIdentityEmail) {
      throw new UnauthorizedException(
        'Invitation email does not match the authenticated account',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const tokenResult = await tx.invitation.updateMany({
        where: {
          id: invitation.id,
          status: INVITATION_PENDING,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: {
            gt: new Date(),
          },
        },
        data: {
          status: INVITATION_ACCEPTED,
          acceptedAt: new Date(),
        },
      });

      if (tokenResult.count !== 1) {
        throw new UnauthorizedException('Invalid or expired invitation');
      }

      try {
        await tx.membership.create({
          data: {
            identityId,
            businessId: invitation.businessId,
            roleId: invitation.roleId,
            status: 'ACTIVE',
          },
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes('Unique constraint')
        ) {
          throw new ConflictException(
            'You already have membership in this business',
          );
        }

        throw error;
      }

      await tx.auditLog.create({
        data: {
          identityId,
          eventType: 'INVITATION_ACCEPTED',
          metadata: {
            invitationId: invitation.id,
            businessId: invitation.businessId,
            roleId: invitation.roleId,
          },
        },
      });
    });
  }

  async revokeInvitation(invitationId: string): Promise<void> {
    const invitation = await this.prisma.invitation.findUnique({
      where: {
        id: invitationId,
      },
      select: {
        id: true,
        businessId: true,
        roleId: true,
        status: true,
        acceptedAt: true,
        revokedAt: true,
      },
    });

    if (!invitation) {
      throw new UnauthorizedException('Invitation not found');
    }

    if (
      invitation.status !== INVITATION_PENDING ||
      invitation.acceptedAt ||
      invitation.revokedAt
    ) {
      throw new ConflictException('Invitation cannot be revoked');
    }

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.invitation.updateMany({
        where: {
          id: invitation.id,
          status: INVITATION_PENDING,
          acceptedAt: null,
          revokedAt: null,
        },
        data: {
          status: INVITATION_REVOKED,
          revokedAt: new Date(),
        },
      });

      if (result.count !== 1) {
        throw new ConflictException('Invitation cannot be revoked');
      }

      await tx.auditLog.create({
        data: {
          eventType: 'INVITATION_REVOKED',
          metadata: {
            invitationId: invitation.id,
            businessId: invitation.businessId,
            roleId: invitation.roleId,
          },
        },
      });
    });
  }
}
