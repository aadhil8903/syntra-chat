import * as dns from 'dns';
// Fix Windows Node.js DNS SRV lookup for MongoDB Atlas (querySrv ECONNREFUSED)
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch {
  // Ignore if not supported
}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const frontendUrl = configService.get<string>('FRONTEND_URL', 'http://localhost:4200');

  // Build list of allowed origins from config and defaults
  const staticAllowedOrigins = [
    'http://localhost:4200',
    'http://127.0.0.1:4200',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];

  if (frontendUrl) {
    const configured = frontendUrl.split(',').map((u) => u.trim()).filter(Boolean);
    staticAllowedOrigins.push(...configured);
  }

  // Enable CORS with secure credentials and flexible origin matching
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = origin.toLowerCase().trim();

      const isExplicitlyAllowed = staticAllowedOrigins.some(
        (allowed) => allowed.toLowerCase() === normalizedOrigin,
      );

      const isDeployDomain =
        normalizedOrigin.endsWith('.trycloudflare.com') ||
        normalizedOrigin.includes('trycloudflare.com') ||
        normalizedOrigin.endsWith('.onrender.com') ||
        normalizedOrigin.includes('onrender.com');

      if (isExplicitlyAllowed || isDeployDomain) {
        return callback(null, true);
      }

      logger.warn(`CORS blocked request from origin: ${origin}`);
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization, X-Requested-With',
  });

  // Global prefix
  // Disable HTTP caching for all API endpoints so ACL changes apply instantly
  app.use((req: any, res: any, next: any) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
  });

  app.setGlobalPrefix('api');

  // Validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  await app.listen(port);
  logger.log(`NestJS Backend running on http://localhost:${port}/api`);
}

bootstrap();
