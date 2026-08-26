import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import { importPKCS8, SignJWT } from 'jose';
import { AccessTokenVerificationService } from './access-token-verification.service';

describe('AccessTokenVerificationService', () => {
  let service: AccessTokenVerificationService;
  let privateKey: CryptoKey;

  const issuer = 'bms-api';
  const audience = 'bms-client';
  const identityId = 'identity-id';
  const sessionId = 'session-id';

  beforeEach(async () => {
    const configService = new ConfigService({
      JWT_ACCESS_PUBLIC_KEY_PATH: 'keys/jwt-access-public.pem',
      JWT_ACCESS_ISSUER: issuer,
      JWT_ACCESS_AUDIENCE: audience,
    });

    service = new AccessTokenVerificationService(configService);

    const privateKeyPem = await readFile('keys/jwt-access-private.pem', 'utf8');

    privateKey = await importPKCS8(privateKeyPem, 'RS256');
  });

  async function createToken(
    overrides: {
      sub?: string;
      sid?: string;
      issuer?: string;
      audience?: string;
    } = {},
  ): Promise<string> {
    return new SignJWT({
      sid: overrides.sid ?? sessionId,
    })
      .setProtectedHeader({
        alg: 'RS256',
        typ: 'JWT',
      })
      .setIssuer(overrides.issuer ?? issuer)
      .setAudience(overrides.audience ?? audience)
      .setSubject(overrides.sub ?? identityId)
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(privateKey);
  }

  it('should verify a valid access token', async () => {
    const token = await createToken();

    const result = await service.verify(token);

    expect(result.sub).toBe(identityId);
    expect(result.sid).toBe(sessionId);
  });

  it('should reject a token with an invalid signature', async () => {
    const { privateKey: differentPrivateKey } = await import('jose').then(
      ({ generateKeyPair }) => generateKeyPair('RS256'),
    );

    const token = await new SignJWT({
      sid: sessionId,
    })
      .setProtectedHeader({
        alg: 'RS256',
        typ: 'JWT',
      })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject(identityId)
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(differentPrivateKey);

    await expect(service.verify(token)).rejects.toThrow(
      'Invalid or expired access token',
    );
  });

  it('should reject a token with the wrong issuer', async () => {
    const token = await createToken({
      issuer: 'wrong-issuer',
    });

    await expect(service.verify(token)).rejects.toThrow(
      'Invalid or expired access token',
    );
  });

  it('should reject a token with the wrong audience', async () => {
    const token = await createToken({
      audience: 'wrong-audience',
    });

    await expect(service.verify(token)).rejects.toThrow(
      'Invalid or expired access token',
    );
  });

  it('should reject a token without a subject', async () => {
    const token = await new SignJWT({
      sid: sessionId,
    })
      .setProtectedHeader({
        alg: 'RS256',
        typ: 'JWT',
      })
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(privateKey);

    await expect(service.verify(token)).rejects.toThrow(
      'Invalid or expired access token',
    );
  });

  it('should reject a token without a session ID', async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({
        alg: 'RS256',
        typ: 'JWT',
      })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject(identityId)
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(privateKey);

    await expect(service.verify(token)).rejects.toThrow(
      'Invalid or expired access token',
    );
  });

  it('should reject an invalid token', async () => {
    await expect(service.verify('not-a-jwt')).rejects.toThrow(
      'Invalid or expired access token',
    );
  });
});
