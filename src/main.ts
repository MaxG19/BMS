import {
  Logger,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api/v1');

  const config = new DocumentBuilder()
    .setTitle('BMS API')
    .setDescription('Business Management System API')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api/v1/docs', app, document);

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

  app.enableShutdownHooks();

  const port = process.env.PORT ?? 3000;

  await app.listen(port, '0.0.0.0');

  logger.log(`Application started on port ${port}`);
}

void bootstrap();
