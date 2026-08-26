import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import { generateKeyPair, importSPKI, jwtVerify } from 'jose';
import { AccessTokenService } from './access-token.service';

describe('AccessTokenService', () => {
  let service: AccessTokenService;
  let publicKey: CryptoKey;

  const issuer = 'bms-api';
  const audience = 'bms-client';
  const identityId = 'identity-id';
  const sessionId = 'session-id';

  beforeEach(async () => {
    const configService = new ConfigService({
      JWT_ACCESS_PRIVATE_KEY_PATH: 'keys/jwt-access-private.pem',
      JWT_ACCESS_PUBLIC_KEY_PATH: 'keys/jwt-access-public.pem',
      JWT_ACCESS_ISSUER: issuer,
      JWT_ACCESS_AUDIENCE: audience,
      JWT_ACCESS_EXPIRES_IN: '15m',
    });

    service = new AccessTokenService(configService);

    const publicKeyPem = await readFile('keys/jwt-access-public.pem', 'utf8');

    publicKey = await importSPKI(publicKeyPem, 'RS256');
  });

  it('should generate a signed RS256 access token', async () => {
    const token = await service.generate(identityId, sessionId);

    const result = await jwtVerify(token, publicKey, {
      algorithms: ['RS256'],
      issuer,
      audience,
    });

    expect(result.payload.sub).toBe(identityId);
    expect(result.payload.iss).toBe(issuer);
    expect(result.payload.aud).toBe(audience);
  });

  it('should include the required JWT claims', async () => {
    const token = await service.generate(identityId, sessionId);

    const { payload } = await jwtVerify(token, publicKey, {
      algorithms: ['RS256'],
      issuer,
      audience,
    });

    expect(payload.sub).toBe(identityId);
    expect(payload.jti).toEqual(expect.any(String));
    expect(payload.iat).toEqual(expect.any(Number));
    expect(payload.exp).toEqual(expect.any(Number));
  });

  it('should generate a unique jti for every token', async () => {
    const firstToken = await service.generate(identityId, sessionId);
    const secondToken = await service.generate(identityId, sessionId);

    const first = await jwtVerify(firstToken, publicKey, {
      algorithms: ['RS256'],
      issuer,
      audience,
    });

    const second = await jwtVerify(secondToken, publicKey, {
      algorithms: ['RS256'],
      issuer,
      audience,
    });

    expect(first.payload.jti).toBeDefined();
    expect(second.payload.jti).toBeDefined();
    expect(first.payload.jti).not.toBe(second.payload.jti);
  });

  it('should expire the access token after 15 minutes', async () => {
    const before = Math.floor(Date.now() / 1000);

    const token = await service.generate(identityId, sessionId);

    const { payload } = await jwtVerify(token, publicKey, {
      algorithms: ['RS256'],
      issuer,
      audience,
    });

    const after = Math.floor(Date.now() / 1000);

    expect(payload.exp).toBeDefined();
    expect(payload.iat).toBeDefined();

    expect(payload.exp! - payload.iat!).toBe(15 * 60);
    expect(payload.iat).toBeGreaterThanOrEqual(before);
    expect(payload.iat).toBeLessThanOrEqual(after);
  });

  it('should reject verification with a different public key', async () => {
    const token = await service.generate(identityId, sessionId);

    const { publicKey: differentPublicKey } = await generateKeyPair('RS256');

    await expect(
      jwtVerify(token, differentPublicKey, {
        algorithms: ['RS256'],
        issuer,
        audience,
      }),
    ).rejects.toThrow();
  });

  it('should not include sensitive authentication data in the payload', async () => {
    const token = await service.generate(identityId, sessionId);

    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
    ) as Record<string, unknown>;

    expect(payload).not.toHaveProperty('password');
    expect(payload).not.toHaveProperty('passwordHash');
    expect(payload).not.toHaveProperty('email');
  });

  it('should include the session ID in the sid claim', async () => {
    const token = await service.generate(identityId, sessionId);

    const { payload } = await jwtVerify(token, publicKey, {
      issuer,
      audience,
    });

    expect(payload.sub).toBe(identityId);
    expect(payload.sid).toBe(sessionId);
  });
});
