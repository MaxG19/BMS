import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AccessTokenVerificationService } from '../access-token-verification.service';

export type AuthenticatedRequest = Request & {
  user: {
    identityId: string;
    sessionId: string;
  };
};

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly accessTokenVerificationService: AccessTokenVerificationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing access token');
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      throw new UnauthorizedException('Missing access token');
    }

    const payload = await this.accessTokenVerificationService.verify(token);

    request.user = {
      identityId: payload.sub,
      sessionId: payload.sid,
    };

    return true;
  }
}
