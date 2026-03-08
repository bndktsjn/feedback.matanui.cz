import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import { join } from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { PrismaService } from './prisma/prisma.service';
import { PrismaSessionStore } from './auth/session/session-store';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  // Increase body size limit for base64 screenshot uploads from overlay widget
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  app.useStaticAssets(join(__dirname, '..', 'public'), { prefix: '/static/' });

  // Trust proxy headers (X-Forwarded-Proto) from Cloudflare tunnel → Apache → API
  app.set('trust proxy', 1);

  app.enableCors({
    origin: true,
    credentials: true,
  });

  const prisma = app.get(PrismaService);

  app.use(cookieParser());

  app.use(
    session({
      store: new PrismaSessionStore(prisma, {
        ttl: Number(process.env.SESSION_MAX_AGE_MS) || 86_400_000,
      }),
      name: 'feedback_sid',
      secret: process.env.SESSION_SECRET || 'dev-session-secret-change-me',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: Number(process.env.SESSION_MAX_AGE_MS) || 86_400_000,
        path: '/',
      },
    }),
  );

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  const port = process.env.API_PORT || 3001;
  await app.listen(port);

  console.log(`API running on http://localhost:${port}/api`);
}

bootstrap();
