import {
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
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

  const identityFindUniqueMock = jest.fn();

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

  type CreateRequestAuditLogArgs = {
    data: {
      identityId: string;
      eventType: string;
      metadata: {
        email: string;
      };
    };
  };

  const requestAuditLogCreateMock: jest.MockedFunction<
    (args: CreateRequestAuditLogArgs) => Promise<AuditLogCreateResult>
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
    identity: {
      findUnique: identityFindUniqueMock,
    },
    emailVerificationToken: {
      create: createVerificationTokenMock,
      findFirst: findFirstVerificationTokenMock,
    },
    auditLog: {
      create: requestAuditLogCreateMock,
    },
    $transaction: jest.fn(
      (
        callback: (tx: typeof transactionClient) => Promise<void>,
      ): Promise<void> => callback(transactionClient),
    ),
  };

  const notificationService = {
    sendEmailVerificationEmail: jest.fn(),
  };

  const emailVerificationRateLimitService = {
    checkRequestLimit: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    emailVerificationRateLimitService.checkRequestLimit.mockResolvedValue(
      undefined,
    );

    notificationService.sendEmailVerificationEmail.mockResolvedValue(undefined);

    createVerificationTokenMock.mockResolvedValue({
      id: 'verification-token-id',
    });

    auditLogCreateMock.mockResolvedValue({
      id: 'audit-log-id',
    });

    requestAuditLogCreateMock.mockResolvedValue({
      id: 'audit-log-id',
    });

    service = new EmailVerificationService(
      prisma as never,
      notificationService as never,
      emailVerificationRateLimitService as never,
    );
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

  describe('requestVerification', () => {
    const genericMessage =
      'If an account exists for that email and is not yet verified, verification instructions have been sent.';

    const unverifiedIdentity = {
      id: 'identity-id',
      email: 'john@example.com',
      emailVerifiedAt: null,
    };

    const verifiedIdentity = {
      id: 'identity-id',
      email: 'john@example.com',
      emailVerifiedAt: new Date(),
    };

    it('should normalize the email before checking the rate limit', async () => {
      identityFindUniqueMock.mockResolvedValue(null);

      await service.requestVerification('  JOHN@EXAMPLE.COM  ');

      expect(
        emailVerificationRateLimitService.checkRequestLimit,
      ).toHaveBeenCalledWith('john@example.com');
    });

    it('should check the rate limit before looking up the identity', async () => {
      identityFindUniqueMock.mockResolvedValue(null);

      const callOrder: string[] = [];

      emailVerificationRateLimitService.checkRequestLimit.mockImplementation(
        () => {
          callOrder.push('rate-limit');
        },
      );

      identityFindUniqueMock.mockImplementation(() => {
        callOrder.push('identity-lookup');
        return null;
      });

      await service.requestVerification('john@example.com');

      expect(callOrder).toEqual(['rate-limit', 'identity-lookup']);
    });

    it('should return the generic response for a nonexistent account', async () => {
      identityFindUniqueMock.mockResolvedValue(null);

      const result = await service.requestVerification('john@example.com');

      expect(result).toEqual({
        message: genericMessage,
      });
    });

    it('should not send a verification email for a nonexistent account', async () => {
      identityFindUniqueMock.mockResolvedValue(null);

      await service.requestVerification('john@example.com');

      expect(
        notificationService.sendEmailVerificationEmail,
      ).not.toHaveBeenCalled();

      expect(createVerificationTokenMock).not.toHaveBeenCalled();

      expect(auditLogCreateMock).not.toHaveBeenCalled();
    });

    it('should return the generic response for an already-verified account', async () => {
      identityFindUniqueMock.mockResolvedValue(verifiedIdentity);

      const result = await service.requestVerification('john@example.com');

      expect(result).toEqual({
        message: genericMessage,
      });
    });

    it('should not create or send a verification token for an already-verified account', async () => {
      identityFindUniqueMock.mockResolvedValue(verifiedIdentity);

      await service.requestVerification('john@example.com');

      expect(createVerificationTokenMock).not.toHaveBeenCalled();

      expect(
        notificationService.sendEmailVerificationEmail,
      ).not.toHaveBeenCalled();

      expect(auditLogCreateMock).not.toHaveBeenCalled();
    });

    it('should create a verification token for an unverified account', async () => {
      identityFindUniqueMock.mockResolvedValue(unverifiedIdentity);

      await service.requestVerification('john@example.com');

      expect(createVerificationTokenMock).toHaveBeenCalledTimes(1);

      const createArguments = createVerificationTokenMock.mock.calls[0]?.[0];

      expect(createArguments).toBeDefined();
      expect(createArguments?.data.identityId).toBe('identity-id');
      expect(createArguments?.data.tokenHash).toEqual(expect.any(String));
      expect(createArguments?.data.expiresAt).toEqual(expect.any(Date));
    });

    it('should send the raw verification token through NotificationService', async () => {
      identityFindUniqueMock.mockResolvedValue(unverifiedIdentity);

      jest
        .spyOn(service, 'createVerificationToken')
        .mockResolvedValue('verification-token');

      await service.requestVerification('john@example.com');

      expect(
        notificationService.sendEmailVerificationEmail,
      ).toHaveBeenCalledWith({
        email: 'john@example.com',
        verificationToken: 'verification-token',
      });
    });

    it('should create the verification-request audit log without storing the raw token', async () => {
      identityFindUniqueMock.mockResolvedValue(unverifiedIdentity);

      jest
        .spyOn(service, 'createVerificationToken')
        .mockResolvedValue('verification-token');

      await service.requestVerification('john@example.com');

      expect(requestAuditLogCreateMock).toHaveBeenCalledWith({
        data: {
          identityId: 'identity-id',
          eventType: 'EMAIL_VERIFICATION_REQUESTED',
          metadata: {
            email: 'john@example.com',
          },
        },
      });

      const auditArguments = requestAuditLogCreateMock.mock.calls[0]?.[0];

      expect(JSON.stringify(auditArguments)).not.toContain(
        'verification-token',
      );
    });

    it('should create the verification token before sending the verification email', async () => {
      identityFindUniqueMock.mockResolvedValue(unverifiedIdentity);

      const callOrder: string[] = [];

      jest.spyOn(service, 'createVerificationToken').mockImplementation(() => {
        callOrder.push('create-token');
        return Promise.resolve('verification-token');
      });

      notificationService.sendEmailVerificationEmail.mockImplementation(() => {
        callOrder.push('send-email');
        return Promise.resolve();
      });

      await service.requestVerification('john@example.com');

      expect(callOrder).toEqual(['create-token', 'send-email']);
    });

    it('should propagate rate-limit failures', async () => {
      const error = new HttpException(
        'Too many email verification requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );

      emailVerificationRateLimitService.checkRequestLimit.mockRejectedValue(
        error,
      );

      await expect(
        service.requestVerification('john@example.com'),
      ).rejects.toThrow('Too many email verification requests');

      expect(identityFindUniqueMock).not.toHaveBeenCalled();
      expect(createVerificationTokenMock).not.toHaveBeenCalled();
      expect(
        notificationService.sendEmailVerificationEmail,
      ).not.toHaveBeenCalled();
    });

    it('should propagate notification failures', async () => {
      identityFindUniqueMock.mockResolvedValue(unverifiedIdentity);

      jest
        .spyOn(service, 'createVerificationToken')
        .mockResolvedValue('verification-token');

      const error = new Error('Notification service unavailable');

      notificationService.sendEmailVerificationEmail.mockRejectedValue(error);

      await expect(
        service.requestVerification('john@example.com'),
      ).rejects.toThrow('Notification service unavailable');

      expect(
        notificationService.sendEmailVerificationEmail,
      ).toHaveBeenCalledWith({
        email: 'john@example.com',
        verificationToken: 'verification-token',
      });
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
