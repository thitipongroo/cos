import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
  );

  // Global prefix — source: backend/src/main.ts (C-04 resolved 2026-05-26)
  app.setGlobalPrefix('api/v1');

  // Global validation pipe — QM-4: all inputs validated at API layer
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Swagger / OpenAPI 3.1 — QM-11
  const config = new DocumentBuilder()
    .setTitle('Construction OS API')
    .setDescription('AI-Native Construction Operating System — REST API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // CORS — QM-4: explicit origins only, never wildcard in production
  app.enableCors({
    origin: process.env['CORS_ORIGINS']?.split(',') ?? ['http://localhost:3001'],
    credentials: true,
  });

  // Capture raw body for webhook HMAC verification — Phase 25
  // Overrides Fastify's built-in JSON parser to attach rawBody Buffer on the request.
  const fastify = app.getHttpAdapter().getInstance() as {
    addContentTypeParser: (
      type: string,
      opts: { parseAs: string },
      fn: (
        req: Record<string, unknown>,
        body: string,
        done: (err: Error | null, payload?: unknown) => void,
      ) => void,
    ) => void;
  };
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    (req as Record<string, unknown>)['rawBody'] = Buffer.from(body ?? '', 'utf8');
    try {
      done(null, JSON.parse(body ?? '{}'));
    } catch (err) {
      (err as NodeJS.ErrnoException).statusCode = 400;
      done(err as Error);
    }
  });

  const port = parseInt(process.env['PORT'] ?? '3000', 10);
  await app.listen(port, '0.0.0.0');
}

bootstrap();
