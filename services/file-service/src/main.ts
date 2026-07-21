// Construction OS — File Service (Fastify)
// Phase 9: File + Document System
// Runtime: Fastify (extracted from monolith for multipart upload throughput)
// See: context/00_master_construction_os.md §Phase 9

// Load .env (services/file-service/.env is symlinked to the repo-root .env) before anything reads
// process.env. file-service is plain Fastify — it has no @nestjs/config; in production the env comes
// from the container, where the missing .env is a harmless no-op.
import 'dotenv/config';
// initTracing must run before the instrumented libraries are required, so it stays directly under the
// dotenv import (same ordering as backend/src/main.ts). It also opens the Prometheus scrape endpoint
// on PROMETHEUS_PORT (9464) — the port prometheus.yml and the Helm chart already point at.
import { initTracing, shutdownTracing } from '@cos/tracing';
initTracing({
  serviceName: process.env['OTEL_SERVICE_NAME'] ?? 'file-service',
  prometheusPort: parseInt(process.env['PROMETHEUS_PORT'] ?? '9464', 10),
});

import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import { createLogger } from '@cos/logger';

import { loadConfig } from './config';
import { tracePlugin } from './plugins/trace';
import { securityPlugin } from './plugins/security';
import { authPlugin } from './plugins/auth';
import { swaggerPlugin } from './plugins/swagger';
import { metricsPlugin } from './plugins/metrics';
import { DbService } from './services/db.service';
import { MinioService } from './services/minio.service';
import { AntivirusService } from './services/antivirus.service';
import { OpenSearchService } from './services/opensearch.service';
import { KafkaService } from './services/kafka.service';
import { ExtractionClient } from './extraction/extraction-client';
import { filesRoutes } from './routes/files.routes';

const logger = createLogger('file-service');

export async function buildApp() {
  const config = loadConfig();

  const app = Fastify({ logger: false, trustProxy: true });

  // ── Plugins (order matters) ────────────────────────────────────────────
  await app.register(tracePlugin);
  await app.register(securityPlugin);
  await app.register(cors, { origin: false }); // CORS blocked — Kong handles origins
  await app.register(multipart, {
    limits: { fileSize: 1024 * 1024 * 1024 }, // 1 GB hard cap (video max)
  });
  await app.register(swaggerPlugin);
  await app.register(metricsPlugin);

  // ── Services (decorated onto app instance) ────────────────────────────
  const db = new DbService(config);
  const minio = new MinioService(config);
  const antivirus = new AntivirusService(config, { db, minio });
  const opensearch = new OpenSearchService(config);
  const kafka = new KafkaService();
  const extraction = new ExtractionClient(config.temporal.address);

  app.decorate('config', config);
  app.decorate('db', db);
  app.decorate('minio', minio);
  app.decorate('antivirus', antivirus);
  app.decorate('opensearch', opensearch);
  app.decorate('kafka', kafka);
  app.decorate('extraction', extraction);

  // ── Auth hook (after decorators, before routes) ───────────────────────
  await app.register(authPlugin);

  // ── Health (no auth required) ─────────────────────────────────────────
  app.get('/health/live', async () => ({ status: 'ok', service: 'file-service' }));
  app.get('/health/ready', async () => ({ status: 'ok', service: 'file-service' }));

  // ── Routes ─────────────────────────────────────────────────────────────
  // No fp() — route plugins must NOT be wrapped with fastify-plugin (would lose encapsulation)
  await app.register(filesRoutes, { prefix: '/api/v1/files' });

  return app;
}

if (require.main === module) {
  buildApp()
    .then(async (app) => {
      const config = loadConfig();
      await app.listen({ port: config.port, host: '0.0.0.0' });
      logger.info({ port: config.port }, 'file-service.started');
      // Flush metrics/traces and release the exporter port on shutdown (mirrors the backend's
      // TracingShutdownService).
      for (const signal of ['SIGTERM', 'SIGINT'] as const) {
        process.once(signal, () => {
          void app
            .close()
            .then(shutdownTracing)
            .then(() => process.exit(0));
        });
      }
    })
    .catch((err) => {
      logger.error({ err }, 'file-service.startup_error');
      process.exit(1);
    });
}
