import { PasswordHashService } from './password-hash.service';

describe('PasswordHashService', () => {
  let service: PasswordHashService;

  beforeEach(() => {
    service = new PasswordHashService();
  });

  it('should hash a password without returning the plaintext password', async () => {
    const password = 'StrongPassword!123';

    const hash = await service.hash(password);

    expect(hash).toBeDefined();
    expect(hash).not.toBe(password);
    expect(typeof hash).toBe('string');
  });

  it('should produce different hashes for the same password', async () => {
    const password = 'StrongPassword!123';

    const firstHash = await service.hash(password);
    const secondHash = await service.hash(password);

    expect(firstHash).not.toBe(secondHash);
  });

  it('should verify the correct password', async () => {
    const password = 'StrongPassword!123';
    const hash = await service.hash(password);

    await expect(service.verify(password, hash)).resolves.toBe(true);
  });

  it('should reject an incorrect password', async () => {
    const password = 'StrongPassword!123';
    const wrongPassword = 'WrongPassword!123';
    const hash = await service.hash(password);

    await expect(service.verify(wrongPassword, hash)).resolves.toBe(false);
  });

  it('should produce an Argon2id hash', async () => {
    const password = 'StrongPassword!123';

    const hash = await service.hash(password);

    expect(hash.startsWith('$argon2id$')).toBe(true);
  });
});
