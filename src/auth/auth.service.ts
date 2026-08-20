import {
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';
import { PasswordHashService } from './password-hash.service';
import { PasswordPolicyService } from './password-policy.service';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHashService: PasswordHashService,
    private readonly passwordPolicyService: PasswordPolicyService,
  ) {}

  async register(dto: RegisterDto) {
    const existingIdentity = await this.prisma.identity.findUnique({
      where: {
        email: dto.email,
      },
      select: {
        id: true,
      },
    });

    if (existingIdentity) {
      throw new ConflictException(
        'An account with this email already exists',
      );
    }

    this.passwordPolicyService.validate(dto.password, {
      email: dto.email,
      name: dto.name,
    });

    const passwordHash = await this.passwordHashService.hash(dto.password);

    const identity = await this.prisma.$transaction(async (tx) => {
      return tx.identity.create({
        data: {
          email: dto.email,
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
}