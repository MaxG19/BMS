import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';
import { PasswordHashService } from './password-hash.service';
import { PasswordPolicyService } from './password-policy.service';
import { RefreshTokenService } from './refresh-token.service';
import { AccessTokenService } from './access-token.service';
import { SessionRevocationService } from './session-revocation.service';
import { EmailVerificationService } from './email-verification.service';
import { NotificationService } from '../common/notifications/notification.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHashService: PasswordHashService,
    private readonly passwordPolicyService: PasswordPolicyService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly accessTokenService: AccessTokenService,
    private readonly sessionRevocationService: SessionRevocationService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly notificationService: NotificationService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const existingIdentity = await this.prisma.identity.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
      },
    });

    if (existingIdentity) {
      throw new ConflictException('An account with this email already exists');
    }

    this.passwordPolicyService.validate(dto.password, {
      email,
      name: dto.name,
    });

    const passwordHash = await this.passwordHashService.hash(dto.password);

    const identity = await this.prisma.$transaction(async (tx) => {
      return tx.identity.create({
        data: {
          email,
          name: dto.name,
          status: 'ACTIVE',
          emailVerifiedAt: null,
          authenticationProviders: {
            create: {
              providerType: 'PASSWORD',
              passwordHash,
            },
          },
        },
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          emailVerifiedAt: true,
          createdAt: true,
        },
      });
    });

    const verificationToken =
      await this.emailVerificationService.createVerificationToken(identity.id);

    await this.notificationService.sendEmailVerificationEmail({
      email: identity.email,
      verificationToken,
    });

    return identity;
  }
  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();

    const identity = await this.prisma.identity.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        emailVerifiedAt: true,
        createdAt: true,
        authenticationProviders: {
          where: {
            providerType: 'PASSWORD',
          },
          select: {
            passwordHash: true,
          },
        },
      },
    });

    if (!identity) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (identity.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }

    const passwordHash = identity.authenticationProviders[0]?.passwordHash;

    if (!passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordValid = await this.passwordHashService.verify(
      dto.password,
      passwordHash,
    );

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!identity.emailVerifiedAt) {
      throw new UnauthorizedException({
        code: 'EMAIL_VERIFICATION_REQUIRED',
        message: 'Email address must be verified',
      });
    }

    const sessionResult = await this.refreshTokenService.createSession(
      identity.id,
    );

    const accessToken = await this.accessTokenService.generate(
      identity.id,
      sessionResult.session.id,
    );

    return {
      id: identity.id,
      email: identity.email,
      name: identity.name,
      status: identity.status,
      emailVerifiedAt: identity.emailVerifiedAt,
      createdAt: identity.createdAt,
      accessToken,
      refreshToken: sessionResult.token,
    };
  }

  async logout(identityId: string, sessionId: string): Promise<void> {
    await this.sessionRevocationService.revokeRequired(
      sessionId,
      identityId,
      'USER_LOGOUT',
    );
  }

  async logoutAll(identityId: string): Promise<number> {
    return this.sessionRevocationService.revokeAll(identityId, 'LOGOUT_ALL');
  }

  async getIdentityEmail(identityId: string): Promise<string> {
    const identity = await this.prisma.identity.findUnique({
      where: {
        id: identityId,
      },
      select: {
        email: true,
      },
    });

    if (!identity) {
      throw new UnauthorizedException('Invalid or expired authentication');
    }

    return identity.email;
  }

  async changePassword(
    identityId: string,
    currentSessionId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const identity = await this.prisma.identity.findUnique({
      where: {
        id: identityId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        authenticationProviders: {
          where: {
            providerType: 'PASSWORD',
          },
          select: {
            id: true,
            passwordHash: true,
          },
        },
      },
    });

    if (!identity || identity.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid or expired authentication');
    }

    const passwordProvider = identity.authenticationProviders[0];

    if (!passwordProvider?.passwordHash) {
      throw new UnauthorizedException('Invalid current password');
    }

    const currentPasswordValid = await this.passwordHashService.verify(
      currentPassword,
      passwordProvider.passwordHash,
    );

    if (!currentPasswordValid) {
      throw new UnauthorizedException('Invalid current password');
    }

    this.passwordPolicyService.validate(newPassword, {
      email: identity.email,
      name: identity.name,
    });

    const passwordHash = await this.passwordHashService.hash(newPassword);

    await this.prisma.$transaction(async (tx) => {
      await tx.authenticationProvider.update({
        where: {
          id: passwordProvider.id,
        },
        data: {
          passwordHash,
        },
      });

      await this.sessionRevocationService.revokeOtherSessions(
        tx,
        identity.id,
        currentSessionId,
      );

      await tx.auditLog.create({
        data: {
          identityId: identity.id,
          eventType: 'PASSWORD_CHANGED',
          metadata: {
            currentSessionId,
          },
        },
      });
    });
  }
}
