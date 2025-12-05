import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupSwagger } from './config/swagger/swagger.config';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { RequestHandler } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser() as RequestHandler);

  app.enableCors({
    origin: 'http://localhost:3000',
    credentials: true,
  });

  if (process.env.NODE_ENV === 'development') {
    setupSwagger(app);
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
