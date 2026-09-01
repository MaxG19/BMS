import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { InvitationService } from './invitation.service';

describe('InvitationService', () => {
  let service: InvitationService;

  type InvitationRecord = {
    id: string;
    businessId: string;
    roleId: string;
    email: string;
    expiresAt: Date;
    acceptedAt: Date | null;
    revokedAt: Date | null;
  };

  type InvitationCreateArgs = {
    data: {
      businessId: string;
      roleId: string;
      email: string;
      tokenHash: string;
      status: string;
      expiresAt: Date;
    };
    select: {
      id: boolean;
      email: boolean;
    };
  };

  type InvitationUpdateManyArgs = {
    where: {
      id: string;
      status: string;
      acceptedAt: Date | null;
      revokedAt: Date | null;
      expiresAt?: {
        gt: Date;
      };
    };
    data: {
      status: string;
      acceptedAt?: Date;
      revokedAt?: Date;
    };
  };

  type MembershipCreateArgs = {
    data: {
      identityId: string;
      businessId: string;
      roleId: string;
      status: string;
    };
  };

  type AuditLogCreateArgs = {
    data: {
      identityId?: string;
      eventType: string;
      metadata: Record<string, string>;
    };
  };

  type InvitationFindFirstArgs = {
    where: {
      businessId?: string;
      email?: string;
      tokenHash?: string;
      status: string;
      acceptedAt: Date | null;
      revokedAt: Date | null;
      expiresAt: {
        gt: Date;
      };
    };
    select?: {
      id: boolean;
      businessId?: boolean;
      roleId?: boolean;
      email?: boolean;
      expiresAt?: boolean;
      acceptedAt?: boolean;
      revokedAt?: boolean;
    };
  };

  type InvitationFindUniqueArgs = {
    where: {
      id: string;
    };
    select: {
      id: boolean;
      businessId: boolean;
      roleId: boolean;
      status: boolean;
      acceptedAt: boolean;
      revokedAt: boolean;
    };
  };

  const invitationFindFirstMock = jest.fn<
    Promise<InvitationRecord | null>,
    [InvitationFindFirstArgs]
  >();

  const invitationFindUniqueMock = jest.fn<
    Promise<{
      id: string;
      businessId: string;
      roleId: string;
      status: string;
      acceptedAt: Date | null;
      revokedAt: Date | null;
    } | null>,
    [InvitationFindUniqueArgs]
  >();

  const invitationCreateMock = jest.fn<
    Promise<{ id: string; email: string }>,
    [InvitationCreateArgs]
  >();

  const invitationUpdateManyMock = jest.fn<
    Promise<{ count: number }>,
    [InvitationUpdateManyArgs]
  >();

  const membershipCreateMock = jest.fn<
    Promise<{ id: string }>,
    [MembershipCreateArgs]
  >();

  const auditLogCreateMock = jest.fn<
    Promise<{ id: string }>,
    [AuditLogCreateArgs]
  >();

  const transactionClient = {
    invitation: {
      findFirst: invitationFindFirstMock,
      create: invitationCreateMock,
      updateMany: invitationUpdateManyMock,
    },
    membership: {
      create: membershipCreateMock,
    },
    auditLog: {
      create: auditLogCreateMock,
    },
  };

  const prisma = {
    invitation: {
      findFirst: invitationFindFirstMock,
      findUnique: invitationFindUniqueMock,
      create: invitationCreateMock,
      updateMany: invitationUpdateManyMock,
    },
    membership: {
      create: membershipCreateMock,
    },
    auditLog: {
      create: auditLogCreateMock,
    },
    $transaction: jest.fn(
      async (
        callback: (tx: typeof transactionClient) => Promise<void>,
      ): Promise<void> => callback(transactionClient),
    ),
  };

  const notificationService = {
    sendInvitationEmail: jest.fn<
      Promise<void>,
      [{ email: string; invitationToken: string }]
    >(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    prisma.$transaction.mockImplementation(
      async (
        callback: (tx: typeof transactionClient) => Promise<void>,
      ): Promise<void> => callback(transactionClient),
    );

    invitationCreateMock.mockResolvedValue({
      id: 'invitation-id',
      email: 'john@example.com',
    });

    auditLogCreateMock.mockResolvedValue({
      id: 'audit-log-id',
    });

    notificationService.sendInvitationEmail.mockResolvedValue(undefined);

    invitationUpdateManyMock.mockResolvedValue({
      count: 1,
    });

    membershipCreateMock.mockResolvedValue({
      id: 'membership-id',
    });

    service = new InvitationService(
      prisma as never,
      notificationService as never,
    );
  });

  describe('normalizeEmail', () => {
    it('should trim whitespace and normalize the email to lowercase', () => {
      expect(service.normalizeEmail('  JOHN@EXAMPLE.COM  ')).toBe(
        'john@example.com',
      );
    });

    it('should preserve an already normalized email', () => {
      expect(service.normalizeEmail('john@example.com')).toBe(
        'john@example.com',
      );
    });
  });

  describe('generateInvitationToken', () => {
    it('should generate a non-empty invitation token', () => {
      const token = service.generateInvitationToken();

      expect(token).toEqual(expect.any(String));
      expect(token.length).toBeGreaterThan(0);
    });

    it('should generate a unique token for each invocation', () => {
      const firstToken = service.generateInvitationToken();
      const secondToken = service.generateInvitationToken();

      expect(firstToken).not.toBe(secondToken);
    });
  });

  describe('hashInvitationToken', () => {
    it('should produce a deterministic hash for the same token', () => {
      const token = 'invitation-token';

      const firstHash = service.hashInvitationToken(token);
      const secondHash = service.hashInvitationToken(token);

      expect(firstHash).toBe(secondHash);
    });

    it('should not return the raw token', () => {
      const token = service.generateInvitationToken();

      const hash = service.hashInvitationToken(token);

      expect(hash).not.toBe(token);
      expect(hash).toEqual(expect.any(String));
    });
  });

  describe('createInvitation', () => {
    it('should normalize the email before persistence', async () => {
      await service.createInvitation(
        'business-id',
        'role-id',
        '  JOHN@EXAMPLE.COM  ',
      );

      expect(invitationCreateMock).toHaveBeenCalledWith({
        data: {
          businessId: 'business-id',
          roleId: 'role-id',
          email: 'john@example.com',
          tokenHash: expect.any(String) as string,
          status: 'PENDING',
          expiresAt: expect.any(Date) as Date,
        },
        select: {
          id: true,
          email: true,
        },
      });
    });

    it('should reject a duplicate pending invitation for the same business and email', async () => {
      invitationFindFirstMock.mockResolvedValue({
        id: 'existing-invitation-id',
        businessId: 'business-id',
        roleId: 'role-id',
        email: 'john@example.com',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        acceptedAt: null,
        revokedAt: null,
      });

      await expect(
        service.createInvitation('business-id', 'role-id', 'john@example.com'),
      ).rejects.toThrow(ConflictException);

      expect(invitationCreateMock).not.toHaveBeenCalled();
      expect(notificationService.sendInvitationEmail).not.toHaveBeenCalled();
    });

    it('should create a pending invitation', async () => {
      invitationFindFirstMock.mockResolvedValue(null);

      await service.createInvitation(
        'business-id',
        'role-id',
        'john@example.com',
      );

      expect(invitationCreateMock).toHaveBeenCalledWith({
        data: {
          businessId: 'business-id',
          roleId: 'role-id',
          email: 'john@example.com',
          tokenHash: expect.any(String) as string,
          status: 'PENDING',
          expiresAt: expect.any(Date) as Date,
        },
        select: {
          id: true,
          email: true,
        },
      });
    });

    it('should persist only the hashed invitation token', async () => {
      invitationFindFirstMock.mockResolvedValue(null);

      const tokenSpy = jest
        .spyOn(service, 'generateInvitationToken')
        .mockReturnValue('raw-invitation-token');

      await service.createInvitation(
        'business-id',
        'role-id',
        'john@example.com',
      );

      const createArguments = invitationCreateMock.mock.calls[0]?.[0];

      expect(createArguments).toBeDefined();
      expect(createArguments.data.tokenHash).toEqual(expect.any(String));
      expect(createArguments.data.tokenHash).not.toBe('raw-invitation-token');
      expect(JSON.stringify(createArguments)).not.toContain(
        'raw-invitation-token',
      );

      tokenSpy.mockRestore();
    });

    it('should set an invitation expiry', async () => {
      invitationFindFirstMock.mockResolvedValue(null);

      const before = Date.now();

      await service.createInvitation(
        'business-id',
        'role-id',
        'john@example.com',
      );

      const after = Date.now();

      const createArguments = invitationCreateMock.mock.calls[0]?.[0];
      const expiresAt = createArguments.data.expiresAt;

      const minimumExpiry = before + 7 * 24 * 60 * 60 * 1000;
      const maximumExpiry = after + 7 * 24 * 60 * 60 * 1000;

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(minimumExpiry);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(maximumExpiry);
    });

    it('should create the invitation audit log without the raw token', async () => {
      invitationFindFirstMock.mockResolvedValue(null);

      jest
        .spyOn(service, 'generateInvitationToken')
        .mockReturnValue('raw-invitation-token');

      await service.createInvitation(
        'business-id',
        'role-id',
        'john@example.com',
      );

      expect(auditLogCreateMock).toHaveBeenCalledWith({
        data: {
          eventType: 'INVITATION_CREATED',
          metadata: {
            invitationId: 'invitation-id',
            businessId: 'business-id',
            roleId: 'role-id',
            email: 'john@example.com',
          },
        },
      });

      const auditArguments = auditLogCreateMock.mock.calls[0]?.[0];

      expect(JSON.stringify(auditArguments)).not.toContain(
        'raw-invitation-token',
      );
    });

    it('should send the raw token through NotificationService', async () => {
      invitationFindFirstMock.mockResolvedValue(null);

      jest
        .spyOn(service, 'generateInvitationToken')
        .mockReturnValue('raw-invitation-token');

      await service.createInvitation(
        'business-id',
        'role-id',
        'john@example.com',
      );

      expect(notificationService.sendInvitationEmail).toHaveBeenCalledWith({
        email: 'john@example.com',
        invitationToken: 'raw-invitation-token',
      });
    });

    it('should create the invitation before sending the email', async () => {
      invitationFindFirstMock.mockResolvedValue(null);

      const callOrder: string[] = [];

      invitationCreateMock.mockImplementation(() => {
        callOrder.push('create-invitation');

        return Promise.resolve({
          id: 'invitation-id',
          email: 'john@example.com',
        });
      });

      notificationService.sendInvitationEmail.mockImplementation(() => {
        callOrder.push('send-email');
        return Promise.resolve();
      });

      await service.createInvitation(
        'business-id',
        'role-id',
        'john@example.com',
      );

      expect(callOrder).toEqual(['create-invitation', 'send-email']);
    });

    it('should propagate notification failures', async () => {
      invitationFindFirstMock.mockResolvedValue(null);

      notificationService.sendInvitationEmail.mockRejectedValue(
        new Error('Notification service unavailable'),
      );

      await expect(
        service.createInvitation('business-id', 'role-id', 'john@example.com'),
      ).rejects.toThrow('Notification service unavailable');

      expect(invitationCreateMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('validateInvitationToken', () => {
    const validInvitation: InvitationRecord = {
      id: 'invitation-id',
      businessId: 'business-id',
      roleId: 'role-id',
      email: 'john@example.com',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      acceptedAt: null,
      revokedAt: null,
    };

    it('should look up the invitation using the hashed token', async () => {
      invitationFindFirstMock.mockResolvedValue(validInvitation);

      await service.validateInvitationToken('invitation-token');

      expect(invitationFindFirstMock).toHaveBeenCalledWith({
        where: {
          tokenHash: service.hashInvitationToken('invitation-token'),
          status: 'PENDING',
          acceptedAt: null,
          revokedAt: null,
          expiresAt: {
            gt: expect.any(Date) as Date,
          },
        },
        select: {
          id: true,
          businessId: true,
          roleId: true,
          email: true,
          expiresAt: true,
          acceptedAt: true,
          revokedAt: true,
        },
      });
    });

    it('should return a valid pending invitation', async () => {
      invitationFindFirstMock.mockResolvedValue(validInvitation);

      const result = await service.validateInvitationToken('invitation-token');

      expect(result).toEqual(validInvitation);
    });

    it('should reject an invalid invitation token', async () => {
      invitationFindFirstMock.mockResolvedValue(null);

      await expect(
        service.validateInvitationToken('invalid-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject an expired invitation', async () => {
      invitationFindFirstMock.mockResolvedValue(null);

      await expect(
        service.validateInvitationToken('expired-token'),
      ).rejects.toThrow('Invalid or expired invitation');
    });

    it('should reject a revoked invitation', async () => {
      invitationFindFirstMock.mockResolvedValue(null);

      await expect(
        service.validateInvitationToken('revoked-token'),
      ).rejects.toThrow('Invalid or expired invitation');
    });

    it('should reject an accepted invitation', async () => {
      invitationFindFirstMock.mockResolvedValue(null);

      await expect(
        service.validateInvitationToken('accepted-token'),
      ).rejects.toThrow('Invalid or expired invitation');
    });
  });

  describe('acceptInvitation', () => {
    const validInvitation: InvitationRecord = {
      id: 'invitation-id',
      businessId: 'business-id',
      roleId: 'role-id',
      email: 'john@example.com',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      acceptedAt: null,
      revokedAt: null,
    };

    beforeEach(() => {
      invitationFindFirstMock.mockResolvedValue(validInvitation);
    });

    it('should reject an invitation when the authenticated email does not match', async () => {
      await expect(
        service.acceptInvitation(
          'invitation-token',
          'identity-id',
          'other@example.com',
        ),
      ).rejects.toThrow(
        'Invitation email does not match the authenticated account',
      );

      expect(invitationUpdateManyMock).not.toHaveBeenCalled();
      expect(membershipCreateMock).not.toHaveBeenCalled();
    });

    it('should normalize the authenticated email before comparison', async () => {
      await expect(
        service.acceptInvitation(
          'invitation-token',
          'identity-id',
          '  JOHN@EXAMPLE.COM  ',
        ),
      ).resolves.toBeUndefined();

      expect(membershipCreateMock).toHaveBeenCalledWith({
        data: {
          identityId: 'identity-id',
          businessId: 'business-id',
          roleId: 'role-id',
          status: 'ACTIVE',
        },
      });
    });

    it('should mark the invitation accepted and create the membership', async () => {
      await service.acceptInvitation(
        'invitation-token',
        'identity-id',
        'john@example.com',
      );

      expect(invitationUpdateManyMock).toHaveBeenCalledWith({
        where: {
          id: 'invitation-id',
          status: 'PENDING',
          acceptedAt: null,
          revokedAt: null,
          expiresAt: {
            gt: expect.any(Date) as Date,
          },
        },
        data: {
          status: 'ACCEPTED',
          acceptedAt: expect.any(Date) as Date,
        },
      });

      expect(membershipCreateMock).toHaveBeenCalledWith({
        data: {
          identityId: 'identity-id',
          businessId: 'business-id',
          roleId: 'role-id',
          status: 'ACTIVE',
        },
      });
    });

    it('should create the invitation audit log after membership creation', async () => {
      const callOrder: string[] = [];

      invitationUpdateManyMock.mockImplementation(() => {
        callOrder.push('accept-invitation');

        return Promise.resolve({ count: 1 });
      });

      membershipCreateMock.mockImplementation(() => {
        callOrder.push('create-membership');

        return Promise.resolve({ id: 'membership-id' });
      });

      auditLogCreateMock.mockImplementation(() => {
        callOrder.push('audit-log');

        return Promise.resolve({ id: 'audit-log-id' });
      });

      await service.acceptInvitation(
        'invitation-token',
        'identity-id',
        'john@example.com',
      );

      expect(callOrder).toEqual([
        'accept-invitation',
        'create-membership',
        'audit-log',
      ]);

      expect(auditLogCreateMock).toHaveBeenCalledWith({
        data: {
          identityId: 'identity-id',
          eventType: 'INVITATION_ACCEPTED',
          metadata: {
            invitationId: 'invitation-id',
            businessId: 'business-id',
            roleId: 'role-id',
          },
        },
      });
    });

    it('should never place the raw invitation token in the audit log', async () => {
      await service.acceptInvitation(
        'raw-invitation-token',
        'identity-id',
        'john@example.com',
      );

      const auditArguments = auditLogCreateMock.mock.calls[0]?.[0];

      expect(JSON.stringify(auditArguments)).not.toContain(
        'raw-invitation-token',
      );
    });

    it('should reject acceptance when the invitation was already consumed', async () => {
      invitationUpdateManyMock.mockResolvedValue({
        count: 0,
      });

      await expect(
        service.acceptInvitation(
          'invitation-token',
          'identity-id',
          'john@example.com',
        ),
      ).rejects.toThrow('Invalid or expired invitation');

      expect(membershipCreateMock).not.toHaveBeenCalled();
      expect(auditLogCreateMock).not.toHaveBeenCalled();
    });

    it('should reject duplicate business membership', async () => {
      membershipCreateMock.mockRejectedValue(
        new Error('Unique constraint failed on Membership'),
      );

      await expect(
        service.acceptInvitation(
          'invitation-token',
          'identity-id',
          'john@example.com',
        ),
      ).rejects.toThrow('You already have membership in this business');
    });

    it('should propagate unexpected membership creation failures', async () => {
      membershipCreateMock.mockRejectedValue(new Error('Database unavailable'));

      await expect(
        service.acceptInvitation(
          'invitation-token',
          'identity-id',
          'john@example.com',
        ),
      ).rejects.toThrow('Database unavailable');
    });

    it('should propagate transaction failures', async () => {
      prisma.$transaction.mockRejectedValue(
        new Error('Invitation transaction failed'),
      );

      await expect(
        service.acceptInvitation(
          'invitation-token',
          'identity-id',
          'john@example.com',
        ),
      ).rejects.toThrow('Invitation transaction failed');
    });
  });

  describe('revokeInvitation', () => {
    const pendingInvitation = {
      id: 'invitation-id',
      businessId: 'business-id',
      roleId: 'role-id',
      status: 'PENDING',
      acceptedAt: null,
      revokedAt: null,
    };

    it('should reject a nonexistent invitation', async () => {
      invitationFindUniqueMock.mockResolvedValue(null);

      await expect(
        service.revokeInvitation('missing-invitation-id'),
      ).rejects.toThrow('Invitation not found');

      expect(invitationUpdateManyMock).not.toHaveBeenCalled();
    });

    it('should revoke a pending invitation', async () => {
      invitationFindUniqueMock.mockResolvedValue(pendingInvitation);

      await service.revokeInvitation('invitation-id');

      expect(invitationUpdateManyMock).toHaveBeenCalledWith({
        where: {
          id: 'invitation-id',
          status: 'PENDING',
          acceptedAt: null,
          revokedAt: null,
        },
        data: {
          status: 'REVOKED',
          revokedAt: expect.any(Date) as Date,
        },
      });
    });

    it('should create a revocation audit log', async () => {
      invitationFindUniqueMock.mockResolvedValue(pendingInvitation);

      await service.revokeInvitation('invitation-id');

      expect(auditLogCreateMock).toHaveBeenCalledWith({
        data: {
          eventType: 'INVITATION_REVOKED',
          metadata: {
            invitationId: 'invitation-id',
            businessId: 'business-id',
            roleId: 'role-id',
          },
        },
      });
    });

    it('should not revoke an already accepted invitation', async () => {
      invitationFindUniqueMock.mockResolvedValue({
        ...pendingInvitation,
        status: 'ACCEPTED',
        acceptedAt: new Date(),
      });

      await expect(service.revokeInvitation('invitation-id')).rejects.toThrow(
        'Invitation cannot be revoked',
      );

      expect(invitationUpdateManyMock).not.toHaveBeenCalled();
    });

    it('should not revoke an already revoked invitation', async () => {
      invitationFindUniqueMock.mockResolvedValue({
        ...pendingInvitation,
        status: 'REVOKED',
        revokedAt: new Date(),
      });

      await expect(service.revokeInvitation('invitation-id')).rejects.toThrow(
        'Invitation cannot be revoked',
      );

      expect(invitationUpdateManyMock).not.toHaveBeenCalled();
    });

    it('should reject a failed revocation update', async () => {
      invitationFindUniqueMock.mockResolvedValue(pendingInvitation);

      invitationUpdateManyMock.mockResolvedValue({
        count: 0,
      });

      await expect(service.revokeInvitation('invitation-id')).rejects.toThrow(
        'Invitation cannot be revoked',
      );

      expect(auditLogCreateMock).not.toHaveBeenCalled();
    });
  });
});
