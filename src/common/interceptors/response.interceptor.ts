import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  HttpException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

interface SuccessResponse<T> {
  success: true;
  data: T | null;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  SuccessResponse<T>
> {
  private readonly logger = new Logger('HTTP');

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessResponse<T>> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = Date.now();

    this.logger.debug(`${request.method} ${request.originalUrl}`);

    return next.handle().pipe(
      map((data: T): SuccessResponse<T> => ({
        success: true,
        data: data ?? null,
      })),
      tap(() => {
        const duration = Date.now() - startedAt;

        this.logger.log(
          `${request.method} ${request.originalUrl} ${response.statusCode} ${duration}ms`,
        );
      }),
      catchError((error: unknown) => {
        const duration = Date.now() - startedAt;

        const status = error instanceof HttpException ? error.getStatus() : 500;

        this.logger.error(
          `${request.method} ${request.originalUrl} ${status} ${duration}ms`,
        );

        return throwError(() => error);
      }),
    );
  }
}
