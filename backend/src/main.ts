// OTel SDK must be initialized before any other imports so auto-instrumentation patches apply.
import { initTracing } from '@cos/tracing';
initTracing({
  serviceName: process.env['OTEL_SERVICE_NAME'] ?? 'cos-backend',
  prometheusPort: parseInt(process.env['PROMETHEUS_PORT'] ?? '9464', 10),
});

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './shared/filters/http-exception.filter';
import { appDatabaseUrl } from './shared/prisma/app-database-url';

async function bootstrap(): Promise<void> {
  // Fail fast at startup if the non-superuser app DB role is not configured — every tenant-scoped
  // query depends on it for PostgreSQL RLS enforcement (spec §7.7, QM-18). Booting without it would
  // silently degrade tenant isolation, so refuse to start rather than fall back to a superuser role.
  appDatabaseUrl();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
    // rawBody: true makes Nest expose req.rawBody (Buffer) for webhook HMAC
    // verification (Phase 25) without manually registering a content-type parser
    // that conflicts with Nest's own JSON body parser registered during init.
    { rawBody: true },
  );

  // Global prefix — source: backend/src/main.ts (C-04 resolved 2026-05-26)
  app.setGlobalPrefix('api/v1');

  // Global exception filter — QM-10: all errors formatted as {error: {code, message, traceId, timestamp}}
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Global validation pipe — QM-4: all inputs validated at API layer
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Swagger / OpenAPI 3.1 — QM-11. Served only outside production: the interactive UI publishes the
  // full API surface with no auth, so it must not be exposed on prod ingress (security misconfig).
  if (process.env['NODE_ENV'] !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Construction OS API')
      .setDescription('AI-Native Construction Operating System — REST API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  // CORS — QM-4: explicit origins only, never wildcard in production. `methods` must be listed
  // explicitly: without it the preflight advertises only GET,HEAD,POST, so the browser blocks every
  // cross-origin PATCH/PUT/DELETE (e.g. incident acknowledge, permit approve) with net::ERR_FAILED.
  app.enableCors({
    origin: process.env['CORS_ORIGINS']?.split(',') ?? ['http://localhost:3001'],
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type'],
    credentials: true,
  });

  // Graceful shutdown — on SIGTERM/SIGINT (e.g. Kubernetes rolling deploy) Nest runs every
  // provider's onModuleDestroy, closing the Redis/Prisma/ClickHouse clients owned across the
  // modules. Without this, those handles are only closed on an explicit app.close() (tests), and
  // in production they would be severed abruptly when the pod is killed.
  app.enableShutdownHooks();

  const port = parseInt(process.env['PORT'] ?? '3000', 10);
  await app.listen(port, '0.0.0.0');
}

bootstrap();
