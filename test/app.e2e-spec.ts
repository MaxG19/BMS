import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/database/prisma/prisma.service';
import { PasswordHashService } from './../src/auth/password-hash.service';
import { PasswordRecoveryService } from './../src/auth/password-recovery.service';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';

type ApiSuccessResponse = {
  success: true;
  data: Record<string, unknown> | null;
};

type ApiErrorResponse = {
  success: false;
  error: {
    code: string;
  };
};

describe('Authentication (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let passwordHashService: PasswordHashService;
  let passwordRecoveryService: PasswordRecoveryService;

  const testEmail = 'be039-e2e@example.com';
  const testPassword = 'StrongPassword!123';
  const resetPassword = 'NewStrongPassword!456';

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.setGlobalPrefix('api/v1');

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: () =>
          new UnprocessableEntityException('Validation failed'),
      }),
    );

    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());

    prisma = app.get(PrismaService);
    passwordHashService = app.get(PasswordHashService);
    passwordRecoveryService = app.get(PasswordRecoveryService);

    await app.init();

    const passwordHash = await passwordHashService.hash(testPassword);

    await prisma.identity.create({
      data: {
        email: testEmail,
        name: 'BE-039 E2E User',
        status: 'ACTIVE',
        authenticationProviders: {
          create: {
            providerType: 'PASSWORD',
            passwordHash,
          },
        },
      },
    });
  });

  afterEach(async () => {
    const identity = await prisma.identity.findUnique({
      where: {
        email: testEmail,
      },
      select: {
        id: true,
      },
    });

    if (identity) {
      await prisma.passwordResetToken.deleteMany({
        where: {
          identityId: identity.id,
        },
      });

      await prisma.session.deleteMany({
        where: {
          identityId: identity.id,
        },
      });

      await prisma.auditLog.deleteMany({
        where: {
          identityId: identity.id,
        },
      });

      await prisma.authenticationProvider.deleteMany({
        where: {
          identityId: identity.id,
        },
      });

      await prisma.identity.delete({
        where: {
          id: identity.id,
        },
      });
    }

    await app.close();
  });

  describe('BE-039 login', () => {
    it('should authenticate a user with valid email and password', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testEmail,
          password: testPassword,
        })
        .expect(201);

      const body = response.body as ApiSuccessResponse;

      expect(body.success).toBe(true);
      expect(body.data).toEqual(
        expect.objectContaining({
          id: expect.any(String) as string,
          email: testEmail,
          name: 'BE-039 E2E User',
          status: 'ACTIVE',
          accessToken: expect.any(String) as string,
          refreshToken: expect.any(String) as string,
        }),
      );

      const sessions = await prisma.session.findMany({
        where: {
          identity: {
            email: testEmail,
          },
        },
      });

      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.refreshTokenHash).toBeTruthy();
    });

    it('should reject invalid credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testEmail,
          password: 'WrongPassword!123',
        })
        .expect(401);

      const body = response.body as ApiErrorResponse;

      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject a login for a non-existent account', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'does-not-exist@example.com',
          password: testPassword,
        })
        .expect(401);

      const body = response.body as ApiErrorResponse;

      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject malformed login credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'not-an-email',
          password: '',
        })
        .expect(422);

      const body = response.body as ApiErrorResponse;

      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('BE-047 password reset', () => {
    async function createResetToken(
      overrides: {
        expiresAt?: Date;
        usedAt?: Date | null;
      } = {},
    ) {
      const identity = await prisma.identity.findUniqueOrThrow({
        where: {
          email: testEmail,
        },
        select: {
          id: true,
        },
      });

      const token = passwordRecoveryService.generateResetToken();
      const tokenHash = passwordRecoveryService.hashResetToken(token);

      await prisma.passwordResetToken.create({
        data: {
          identityId: identity.id,
          tokenHash,
          expiresAt:
            overrides.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
          usedAt: overrides.usedAt ?? null,
        },
      });

      return {
        identityId: identity.id,
        token,
      };
    }

    it('should reset the password through the HTTP endpoint', async () => {
      const { token } = await createResetToken();

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({
          token,
          password: resetPassword,
        })
        .expect(201);

      const body = response.body as ApiSuccessResponse;

      expect(body).toEqual({
        success: true,
        data: null,
      });
    });

    it('should prevent the old password from authenticating after reset', async () => {
      const { token } = await createResetToken();

      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({
          token,
          password: resetPassword,
        })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testEmail,
          password: testPassword,
        })
        .expect(401);

      const body = response.body as ApiErrorResponse;

      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should allow the new password to authenticate after reset', async () => {
      const { token } = await createResetToken();

      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({
          token,
          password: resetPassword,
        })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testEmail,
          password: resetPassword,
        })
        .expect(201);

      const body = response.body as ApiSuccessResponse;

      expect(body.success).toBe(true);
      expect(body.data).toEqual(
        expect.objectContaining({
          email: testEmail,
          accessToken: expect.any(String) as string,
          refreshToken: expect.any(String) as string,
        }),
      );
    });

    it('should consume the reset token and prevent reuse', async () => {
      const { token, identityId } = await createResetToken();

      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({
          token,
          password: resetPassword,
        })
        .expect(201);

      const storedToken = await prisma.passwordResetToken.findFirstOrThrow({
        where: {
          identityId,
        },
      });

      expect(storedToken.usedAt).toBeInstanceOf(Date);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({
          token,
          password: 'AnotherStrongPassword!789',
        })
        .expect(401);

      const body = response.body as ApiErrorResponse;

      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject an expired reset token', async () => {
      const { token } = await createResetToken({
        expiresAt: new Date(Date.now() - 60 * 1000),
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({
          token,
          password: resetPassword,
        })
        .expect(401);

      const body = response.body as ApiErrorResponse;

      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject a reset token that was already used', async () => {
      const { token } = await createResetToken({
        usedAt: new Date(),
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({
          token,
          password: resetPassword,
        })
        .expect(401);

      const body = response.body as ApiErrorResponse;

      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject a password that violates the password policy', async () => {
      const { token } = await createResetToken();

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({
          token,
          password: 'weak',
        })
        .expect(422);

      const body = response.body as ApiErrorResponse;

      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');

      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testEmail,
          password: testPassword,
        })
        .expect(201);

      const loginBody = loginResponse.body as ApiSuccessResponse;

      expect(loginBody.success).toBe(true);
    });

    it('should revoke existing sessions after a successful password reset', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testEmail,
          password: testPassword,
        })
        .expect(201);

      const loginBody = loginResponse.body as ApiSuccessResponse;

      const accessToken = loginBody.data?.accessToken;

      expect(accessToken).toEqual(expect.any(String));

      const { token, identityId } = await createResetToken();

      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({
          token,
          password: resetPassword,
        })
        .expect(201);

      const sessions = await prisma.session.findMany({
        where: {
          identityId,
        },
        select: {
          revokedAt: true,
        },
      });

      expect(sessions.length).toBeGreaterThanOrEqual(1);
      expect(
        sessions.every((session) => session.revokedAt instanceof Date),
      ).toBe(true);
    });

    it('should create a password reset completion audit log', async () => {
      const { token, identityId } = await createResetToken();

      await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .send({
          token,
          password: resetPassword,
        })
        .expect(201);

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          identityId,
          eventType: 'PASSWORD_RESET_COMPLETED',
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      expect(auditLog).not.toBeNull();
      expect(auditLog?.metadata).toEqual(
        expect.objectContaining({
          resetTokenId: expect.any(String) as string,
        }),
      );
    });
  });
});
