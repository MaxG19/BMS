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
          createdAt: true,
        },
      });
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
}
