import { Injectable, UnauthorizedException } from '@nestjs/common';
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
}
