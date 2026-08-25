import { ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  const identity = {
    id: 'identity-id',
    email: 'john@example.com',
    name: 'John Doe',
    status: 'ACTIVE',
    createdAt: new Date(),
  };

  type CreateIdentityArgs = {
    data: {
      email: string;
      name: string;
      status: string;
      authenticationProviders: {
        create: {
          providerType: string;
          passwordHash: string;
        };
      };
    };
    select: Record<string, boolean>;
  };

  const createIdentityMock: jest.MockedFunction<
    (args: CreateIdentityArgs) => Promise<typeof identity>
  > = jest.fn();

  const transactionClient = {
    identity: {
      create: createIdentityMock,
    },
  };

  const prisma = {
    identity: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(
      (callback: (tx: typeof transactionClient) => Promise<typeof identity>) =>
        callback(transactionClient),
    ),
  };

  const passwordHashService = {
    hash: jest.fn(),
    verify: jest.fn(),
  };

  const passwordPolicyService = {
    validate: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    createIdentityMock.mockResolvedValue(identity);

    service = new AuthService(
      prisma as never,
      passwordHashService,
      passwordPolicyService,
    );
  });

  it('should reject registration when the email already exists', async () => {
    prisma.identity.findUnique.mockResolvedValue({
      id: 'existing-id',
    });

    await expect(
      service.register({
        email: 'john@example.com',
        password: 'StrongPassword!123',
        name: 'John Doe',
      }),
    ).rejects.toThrow(ConflictException);

    expect(passwordPolicyService.validate).not.toHaveBeenCalled();
    expect(passwordHashService.hash).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('should validate the password before hashing it', async () => {
    prisma.identity.findUnique.mockResolvedValue(null);
    passwordHashService.hash.mockResolvedValue('argon2-hash');

    await service.register({
      email: 'john@example.com',
      password: 'StrongPassword!123',
      name: 'John Doe',
    });

    expect(passwordPolicyService.validate).toHaveBeenCalledWith(
      'StrongPassword!123',
      {
        email: 'john@example.com',
        name: 'John Doe',
      },
    );

    expect(passwordHashService.hash).toHaveBeenCalledWith('StrongPassword!123');
  });

  it('should persist the password hash and never the plaintext password', async () => {
    prisma.identity.findUnique.mockResolvedValue(null);
    passwordHashService.hash.mockResolvedValue('argon2-hash');

    const password = 'StrongPassword!123';

    const result = await service.register({
      email: 'john@example.com',
      password,
      name: 'John Doe',
    });

    const createArguments = createIdentityMock.mock.calls[0]?.[0];

    expect(createArguments).toBeDefined();
    expect(createArguments?.data.authenticationProviders.create).toEqual({
      providerType: 'PASSWORD',
      passwordHash: 'argon2-hash',
    });

    expect(JSON.stringify(createArguments)).not.toContain(password);
    expect(JSON.stringify(createArguments)).toContain('argon2-hash');

    expect(JSON.stringify(result)).not.toContain(password);
    expect(JSON.stringify(result)).not.toContain('argon2-hash');
  });

  it('should create the identity inside a transaction', async () => {
    prisma.identity.findUnique.mockResolvedValue(null);
    passwordHashService.hash.mockResolvedValue('argon2-hash');

    await service.register({
      email: 'john@example.com',
      password: 'StrongPassword!123',
      name: 'John Doe',
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(createIdentityMock).toHaveBeenCalledTimes(1);
  });

  it('should not hash a password when password policy validation fails', async () => {
    prisma.identity.findUnique.mockResolvedValue(null);

    passwordPolicyService.validate.mockImplementation(() => {
      throw new Error('Password policy rejected');
    });

    await expect(
      service.register({
        email: 'john@example.com',
        password: 'WeakPassword',
        name: 'John Doe',
      }),
    ).rejects.toThrow('Password policy rejected');

    expect(passwordHashService.hash).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
