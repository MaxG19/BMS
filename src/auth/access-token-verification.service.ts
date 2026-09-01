import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import { importSPKI, jwtVerify, type JWTPayload } from 'jose';

export type AccessTokenPayload = JWTPayload & {
  sub: string;
  sid: string;
};

@Injectable()
export class AccessTokenVerificationService {
  private readonly publicKey: Promise<CryptoKey>;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(private readonly configService: ConfigService) {
    const publicKey = this.configService.get<string>('JWT_ACCESS_PUBLIC_KEY');

    const publicKeyPath = this.configService.get<string>(
      'JWT_ACCESS_PUBLIC_KEY_PATH',
    );

    this.issuer = this.configService.getOrThrow<string>('JWT_ACCESS_ISSUER');

    this.audience = this.configService.getOrThrow<string>(
      'JWT_ACCESS_AUDIENCE',
    );

    this.publicKey =
      publicKey !== undefined
        ? importSPKI(publicKey.replace(/\\n/g, '\n'), 'RS256')
        : readFile(publicKeyPath ?? '', 'utf8').then((key) =>
            importSPKI(key, 'RS256'),
          );
  }

  async verify(token: string): Promise<AccessTokenPayload> {
    try {
      const key = await this.publicKey;

      const { payload } = await jwtVerify(token, key, {
        algorithms: ['RS256'],
        issuer: this.issuer,
        audience: this.audience,
      });

      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
        throw new UnauthorizedException('Invalid access token');
      }

      return payload as AccessTokenPayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
