import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma/prisma.service';

@Injectable()
export class SessionRevocationService {
  constructor(private readonly prisma: PrismaService) {}

  async revoke(
    sessionId: string,
    identityId: string,
    reason = 'USER_LOGOUT',
  ): Promise<void> {
    const revokedAt = new Date();

    const result = await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        identityId,
        revokedAt: null,
      },
      data: {
        revokedAt,
      },
    });

    if (result.count === 0) {
      return;
    }

    await this.prisma.auditLog.create({
      data: {
        identityId,
        eventType: 'SESSION_REVOKED',
        metadata: {
          sessionId,
          reason,
        },
      },
    });
  }

  async revokeAll(identityId: string, reason = 'LOGOUT_ALL'): Promise<number> {
    const revokedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.session.updateMany({
        where: {
          identityId,
          revokedAt: null,
        },
        data: {
          revokedAt,
        },
      });

      if (result.count === 0) {
        return 0;
      }

      await tx.auditLog.create({
        data: {
          identityId,
          eventType: 'SESSIONS_REVOKED',
          metadata: {
            reason,
            revokedSessionCount: result.count,
          },
        },
      });

      return result.count;
    });
  }

  async revokeRequired(
    sessionId: string,
    identityId: string,
    reason = 'USER_LOGOUT',
  ): Promise<void> {
    const revokedAt = new Date();

    const result = await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        identityId,
        revokedAt: null,
      },
      data: {
        revokedAt,
      },
    });

    if (result.count !== 1) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    await this.prisma.auditLog.create({
      data: {
        identityId,
        eventType: 'SESSION_REVOKED',
        metadata: {
          sessionId,
          reason,
        },
      },
    });
  }
  async revokeOtherSessions(
    tx: Prisma.TransactionClient,
    identityId: string,
    currentSessionId: string,
  ): Promise<number> {
    const revokedAt = new Date();

    const result = await tx.session.updateMany({
      where: {
        identityId,
        id: {
          not: currentSessionId,
        },
        revokedAt: null,
      },
      data: {
        revokedAt,
      },
    });

    if (result.count === 0) {
      return 0;
    }

    await tx.auditLog.create({
      data: {
        identityId,
        eventType: 'SESSIONS_REVOKED',
        metadata: {
          reason: 'PASSWORD_CHANGED',
          revokedSessionCount: result.count,
        },
      },
    });

    return result.count;
  }
}
