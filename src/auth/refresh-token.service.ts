import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma/prisma.service';

const REFRESH_TOKEN_BYTES = 32;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class RefreshTokenService {
  constructor(private readonly prisma: PrismaService) {}

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
        expiresAt: {
          gt: new Date(),
        },
      },
      select: {
        id: true,
        identityId: true,
        expiresAt: true,
        revokedAt: true,
      },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return session;
  }
}
