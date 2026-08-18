import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const code = this.getErrorCode(status);

    response.status(status).json({
      statusCode: status,
      code,
      message:
        exception instanceof HttpException
          ? exception.message
          : 'Internal server error',
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private getErrorCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';

      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';

      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';

      case HttpStatus.NOT_FOUND:
        return 'RESOURCE_NOT_FOUND';

      case HttpStatus.CONFLICT:
        return 'CONFLICT';

      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'VALIDATION_ERROR';

      case HttpStatus.INTERNAL_SERVER_ERROR:
      default:
        return 'INTERNAL_SERVER_ERROR';
    }
  }
}
