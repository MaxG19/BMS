import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma/prisma.service';
import { AccessTokenService } from './access-token.service';
import { SessionPolicyService } from './session-policy.service';
import { SessionRevocationService } from './session-revocation.service';

const REFRESH_TOKEN_BYTES = 32;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessTokenService: AccessTokenService,
    private readonly sessionPolicyService: SessionPolicyService,
    private readonly sessionRevocationService: SessionRevocationService,
  ) {}
  generateToken(): string {
    return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  async createSession(
    identityId: string,
    metadata?: {
      userAgent?: string;
      ipAddress?: string;
    },
  ) {
    const token = this.generateToken();
    const refreshTokenHash = this.hashToken(token);

    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    const session = await this.prisma.session.create({
      data: {
        identityId,
        refreshTokenHash,
        userAgent: metadata?.userAgent,
        ipAddress: metadata?.ipAddress,
        expiresAt,
      },
      select: {
        id: true,
        identityId: true,
        createdAt: true,
        lastActiveAt: true,
        expiresAt: true,
      },
    });

    return {
      token,
      session,
    };
  }

  async validateToken(token: string): Promise<{
    id: string;
    identityId: string;
    expiresAt: Date;
    revokedAt: Date | null;
  }> {
    const refreshTokenHash = this.hashToken(token);

    const session = await this.prisma.session.findFirst({
      where: {
        refreshTokenHash,
        revokedAt: null,
      },
      select: {
        id: true,
        identityId: true,
        createdAt: true,
        lastActiveAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const now = new Date();

    if (session.expiresAt.getTime() <= now.getTime()) {
      await this.sessionRevocationService.revoke(
        session.id,
        session.identityId,
        'SESSION_EXPIRY',
      );

      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (this.sessionPolicyService.isAbsolutelyExpired(session.createdAt, now)) {
      await this.sessionRevocationService.revoke(
        session.id,
        session.identityId,
        'ABSOLUTE_SESSION_LIFETIME',
      );

      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (this.sessionPolicyService.isIdle(session.lastActiveAt, now)) {
      await this.sessionRevocationService.revoke(
        session.id,
        session.identityId,
        'IDLE_TIMEOUT',
      );

      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return {
      id: session.id,
      identityId: session.identityId,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
    };
  }

  async rotateToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const session = await this.validateToken(refreshToken);
    const now = new Date();
    const oldHash = this.hashToken(refreshToken);

    const newRefreshToken = this.generateToken();
    const newHash = this.hashToken(newRefreshToken);

    const rotated = await this.prisma.session.updateMany({
      where: {
        id: session.id,
        refreshTokenHash: oldHash,
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      data: {
        refreshTokenHash: newHash,
        lastActiveAt: now,
      },
    });

    if (rotated.count !== 1) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const accessToken = await this.accessTokenService.generate(
      session.identityId,
      session.id,
    );

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }
}
