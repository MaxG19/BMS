import { UnauthorizedException } from '@nestjs/common';
import { EmailVerificationService } from './email-verification.service';

describe('EmailVerificationService', () => {
  let service: EmailVerificationService;

  type VerificationToken = {
    id: string;
    identityId: string;
    expiresAt: Date;
    usedAt: Date | null;
  };

  type CreateVerificationTokenArgs = {
    data: {
      identityId: string;
      tokenHash: string;
      expiresAt: Date;
    };
  };

  type FindFirstVerificationTokenArgs = {
    where: {
      tokenHash: string;
      usedAt: null;
      expiresAt: {
        gt: Date;
      };
    };
    select: {
      id: true;
      identityId: true;
      expiresAt: true;
      usedAt: true;
    };
  };

  const createVerificationTokenMock: jest.MockedFunction<
    (args: CreateVerificationTokenArgs) => Promise<{ id: string }>
  > = jest.fn();

  const findFirstVerificationTokenMock: jest.MockedFunction<
    (args: FindFirstVerificationTokenArgs) => Promise<VerificationToken | null>
  > = jest.fn();

  type UpdateManyResult = {
    count: number;
  };

  type AuditLogCreateResult = {
    id: string;
  };

  type UpdateVerificationTokenArgs = {
    where: {
      id: string;
      usedAt: null;
      expiresAt: {
        gt: Date;
      };
    };
    data: {
      usedAt: Date;
    };
  };

  type UpdateIdentityArgs = {
    where: {
      id: string;
      emailVerifiedAt: null;
    };
    data: {
      emailVerifiedAt: Date;
    };
  };

  type CreateAuditLogArgs = {
    data: {
      identityId: string;
      eventType: string;
      metadata: {
        verificationTokenId: string;
      };
    };
  };

  const emailVerificationTokenUpdateManyMock: jest.MockedFunction<
    (args: UpdateVerificationTokenArgs) => Promise<UpdateManyResult>
  > = jest.fn();

  const identityUpdateManyMock: jest.MockedFunction<
    (args: UpdateIdentityArgs) => Promise<UpdateManyResult>
  > = jest.fn();

  const auditLogCreateMock: jest.MockedFunction<
    (args: CreateAuditLogArgs) => Promise<AuditLogCreateResult>
  > = jest.fn();

  const transactionClient = {
    emailVerificationToken: {
      updateMany: emailVerificationTokenUpdateManyMock,
    },
    identity: {
      updateMany: identityUpdateManyMock,
    },
    auditLog: {
      create: auditLogCreateMock,
    },
  };

  const prisma = {
    emailVerificationToken: {
      create: createVerificationTokenMock,
      findFirst: findFirstVerificationTokenMock,
    },
    $transaction: jest.fn(
      async (
        callback: (tx: typeof transactionClient) => Promise<void>,
      ): Promise<void> => callback(transactionClient),
    ),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new EmailVerificationService(prisma as never);
  });

  describe('generateVerificationToken', () => {
    it('should generate a non-empty verification token', () => {
      const token = service.generateVerificationToken();

      expect(token).toEqual(expect.any(String));
      expect(token.length).toBeGreaterThan(0);
    });

    it('should generate a unique token for each request', () => {
      const firstToken = service.generateVerificationToken();
      const secondToken = service.generateVerificationToken();

      expect(firstToken).not.toBe(secondToken);
    });
  });

  describe('hashVerificationToken', () => {
    it('should produce a deterministic hash for the same token', () => {
      const token = 'verification-token';

      const firstHash = service.hashVerificationToken(token);
      const secondHash = service.hashVerificationToken(token);

      expect(firstHash).toBe(secondHash);
    });

    it('should not return the raw token', () => {
      const token = service.generateVerificationToken();

      const hash = service.hashVerificationToken(token);

      expect(hash).not.toBe(token);
      expect(hash).toEqual(expect.any(String));
    });
  });

  describe('createVerificationToken', () => {
    it('should persist only the hashed token', async () => {
      prisma.emailVerificationToken.create.mockResolvedValue({
        id: 'verification-token-id',
      });

      const identityId = 'identity-id';

      const token = await service.createVerificationToken(identityId);

      const createArguments =
        prisma.emailVerificationToken.create.mock.calls[0]?.[0];

      expect(createArguments).toBeDefined();
      expect(createArguments?.data.identityId).toBe(identityId);
      expect(createArguments?.data.tokenHash).toEqual(expect.any(String));
      expect(createArguments?.data.expiresAt).toEqual(expect.any(Date));

      expect(createArguments?.data.tokenHash).not.toBe(token);

      expect(JSON.stringify(createArguments)).not.toContain(token);
    });

    it('should create a token that expires after 24 hours', async () => {
      prisma.emailVerificationToken.create.mockResolvedValue({
        id: 'verification-token-id',
      });

      const before = Date.now();

      await service.createVerificationToken('identity-id');

      const after = Date.now();

      const createArguments =
        prisma.emailVerificationToken.create.mock.calls[0]?.[0];

      const expiresAt = createArguments?.data.expiresAt;

      const minimumExpiry = before + 24 * 60 * 60 * 1000;
      const maximumExpiry = after + 24 * 60 * 60 * 1000;

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(minimumExpiry);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(maximumExpiry);
    });

    it('should return the raw token for delivery to the user', async () => {
      prisma.emailVerificationToken.create.mockResolvedValue({
        id: 'verification-token-id',
      });

      const token = await service.createVerificationToken('identity-id');

      expect(token).toEqual(expect.any(String));

      const createArguments =
        prisma.emailVerificationToken.create.mock.calls[0]?.[0];

      expect(createArguments?.data.tokenHash).not.toBe(token);
    });
  });

  describe('validateVerificationToken', () => {
    it('should return a valid unused verification token', async () => {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      prisma.emailVerificationToken.findFirst.mockResolvedValue({
        id: 'verification-token-id',
        identityId: 'identity-id',
        expiresAt,
        usedAt: null,
      });

      const result =
        await service.validateVerificationToken('verification-token');

      const findFirstCall =
        prisma.emailVerificationToken.findFirst.mock.calls[0]?.[0];

      expect(findFirstCall).toBeDefined();
      expect(findFirstCall.where.tokenHash).toBe(
        service.hashVerificationToken('verification-token'),
      );
      expect(findFirstCall.where.usedAt).toBeNull();
      expect(findFirstCall.where.expiresAt.gt).toBeInstanceOf(Date);
      expect(findFirstCall.select).toEqual({
        id: true,
        identityId: true,
        expiresAt: true,
        usedAt: true,
      });

      expect(result).toEqual({
        id: 'verification-token-id',
        identityId: 'identity-id',
        expiresAt,
        usedAt: null,
      });
    });

    it('should reject an invalid verification token', async () => {
      prisma.emailVerificationToken.findFirst.mockResolvedValue(null);

      await expect(
        service.validateVerificationToken('invalid-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject an expired verification token', async () => {
      prisma.emailVerificationToken.findFirst.mockResolvedValue(null);

      await expect(
        service.validateVerificationToken('expired-token'),
      ).rejects.toThrow('Invalid or expired verification token');

      const findFirstCall =
        prisma.emailVerificationToken.findFirst.mock.calls[0]?.[0];

      expect(findFirstCall).toBeDefined();
      expect(findFirstCall.where.usedAt).toBeNull();
      expect(findFirstCall.where.expiresAt.gt).toBeInstanceOf(Date);
    });

    it('should reject a used verification token', async () => {
      prisma.emailVerificationToken.findFirst.mockResolvedValue(null);

      await expect(
        service.validateVerificationToken('used-token'),
      ).rejects.toThrow('Invalid or expired verification token');

      const findFirstCall =
        prisma.emailVerificationToken.findFirst.mock.calls[0]?.[0];

      expect(findFirstCall).toBeDefined();
      expect(findFirstCall.where.usedAt).toBeNull();
    });
  });

  describe('verifyEmail', () => {
    it('should consume the token, verify the identity, and create an audit log', async () => {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      prisma.emailVerificationToken.findFirst.mockResolvedValue({
        id: 'verification-token-id',
        identityId: 'identity-id',
        expiresAt,
        usedAt: null,
      });

      transactionClient.emailVerificationToken.updateMany.mockResolvedValue({
        count: 1,
      });

      transactionClient.identity.updateMany.mockResolvedValue({
        count: 1,
      });

      transactionClient.auditLog.create.mockResolvedValue({
        id: 'audit-log-id',
      } as const);

      await service.verifyEmail('verification-token');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      const tokenUpdateCall =
        transactionClient.emailVerificationToken.updateMany.mock.calls[0]?.[0];

      expect(tokenUpdateCall).toBeDefined();
      expect(tokenUpdateCall.where.id).toBe('verification-token-id');
      expect(tokenUpdateCall.where.usedAt).toBeNull();
      expect(tokenUpdateCall.where.expiresAt.gt).toBeInstanceOf(Date);
      expect(tokenUpdateCall.data.usedAt).toBeInstanceOf(Date);

      const identityUpdateCall =
        transactionClient.identity.updateMany.mock.calls[0]?.[0];

      expect(identityUpdateCall).toBeDefined();
      expect(identityUpdateCall.where.id).toBe('identity-id');
      expect(identityUpdateCall.where.emailVerifiedAt).toBeNull();
      expect(identityUpdateCall.data.emailVerifiedAt).toBeInstanceOf(Date);

      expect(transactionClient.auditLog.create).toHaveBeenCalledWith({
        data: {
          identityId: 'identity-id',
          eventType: 'EMAIL_VERIFIED',
          metadata: {
            verificationTokenId: 'verification-token-id',
          },
        },
      });
    });

    it('should reject the verification when token consumption fails', async () => {
      prisma.emailVerificationToken.findFirst.mockResolvedValue({
        id: 'verification-token-id',
        identityId: 'identity-id',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        usedAt: null,
      });

      transactionClient.emailVerificationToken.updateMany.mockResolvedValue({
        count: 0,
      } as const);

      await expect(service.verifyEmail('verification-token')).rejects.toThrow(
        'Invalid or expired verification token',
      );

      expect(transactionClient.identity.updateMany).not.toHaveBeenCalled();
      expect(transactionClient.auditLog.create).not.toHaveBeenCalled();
    });

    it('should reject the verification when the identity cannot be marked verified', async () => {
      prisma.emailVerificationToken.findFirst.mockResolvedValue({
        id: 'verification-token-id',
        identityId: 'identity-id',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        usedAt: null,
      });

      transactionClient.emailVerificationToken.updateMany.mockResolvedValue({
        count: 1,
      });

      transactionClient.identity.updateMany.mockResolvedValue({
        count: 0,
      } as const);

      await expect(service.verifyEmail('verification-token')).rejects.toThrow(
        'Email verification is unavailable',
      );

      expect(transactionClient.auditLog.create).not.toHaveBeenCalled();
    });

    it('should propagate transaction failures', async () => {
      prisma.emailVerificationToken.findFirst.mockResolvedValue({
        id: 'verification-token-id',
        identityId: 'identity-id',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        usedAt: null,
      });

      transactionClient.emailVerificationToken.updateMany.mockResolvedValue({
        count: 1,
      });

      transactionClient.identity.updateMany.mockResolvedValue({
        count: 1,
      });

      transactionClient.auditLog.create.mockRejectedValue(
        new Error('Audit log failed'),
      );

      await expect(service.verifyEmail('verification-token')).rejects.toThrow(
        'Audit log failed',
      );
    });
  });
});
