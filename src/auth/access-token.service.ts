import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { importPKCS8, SignJWT } from 'jose';

@Injectable()
export class AccessTokenService {
  private readonly privateKey: Promise<CryptoKey>;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly expiresIn: string;

  constructor(private readonly configService: ConfigService) {
    const privateKey = this.configService.get<string>('JWT_ACCESS_PRIVATE_KEY');

    const privateKeyPath = this.configService.get<string>(
      'JWT_ACCESS_PRIVATE_KEY_PATH',
    );

    this.issuer = this.configService.getOrThrow<string>('JWT_ACCESS_ISSUER');
    this.audience = this.configService.getOrThrow<string>(
      'JWT_ACCESS_AUDIENCE',
    );
    this.expiresIn = this.configService.getOrThrow<string>(
      'JWT_ACCESS_EXPIRES_IN',
    );

    this.privateKey =
      privateKey !== undefined
        ? importPKCS8(privateKey.replace(/\\n/g, '\n'), 'RS256')
        : readFile(privateKeyPath ?? '', 'utf8').then((key) =>
            importPKCS8(key, 'RS256'),
          );
  }

  async generate(identityId: string, sessionId: string): Promise<string> {
    const key = await this.privateKey;

    return new SignJWT({
      sid: sessionId,
    })
      .setProtectedHeader({
        alg: 'RS256',
        typ: 'JWT',
      })
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setSubject(identityId)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(this.expiresIn)
      .sign(key);
  }
}
