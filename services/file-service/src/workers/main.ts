// File Service Temporal worker entrypoint — file-cleanup and zip-extraction.
//
// WHY THIS FILE EXISTS
// --------------------
// Both worker files already existed and neither was ever launched: the Dockerfile runs
// `services/file-service/dist/.../main.js` and nothing else, the Helm chart sets no command or args,
// and no npm script, Compose service or CI step starts them. main.ts constructs an ExtractionClient
// — a Temporal CLIENT — so uploads started zip-extraction workflows that no worker executed.
//
// The two consequences were different in kind:
//   file-cleanup     — the daily hard-delete of files past their retention window never ran, so
//                      soft-deleted files stay in MinIO indefinitely. That undercuts the
//                      retention_policies / legal-hold design and any PDPA erasure request.
//   zip-extraction   — a bulk ZIP upload is accepted and never unpacked.
//
// Product-owner decision 2026-08-22 (TDD OQ-32): run the workers as their own Deployment, separate
// from the Fastify API. Same image, different command — see
// infrastructure/helm/cos-file-service/templates/worker-deployment.yaml.
//
// Both queues run in ONE process: each worker builds its own DbService / MinioService /
// OpenSearchService from loadConfig(), so they share nothing but the config file and compose with
// Promise.all.

import { createServer } from 'http';
import { createLogger } from '@cos/logger';
import { runFileCleanupWorker } from '../cleanup/worker';
import { runZipExtractionWorker } from '../extraction/worker';

const logger = createLogger('file-service.workers');

const QUEUES = ['file-cleanup', 'zip-extraction'] as const;
const HEALTH_PORT = Number(process.env['WORKER_HEALTH_PORT'] ?? 8090);

/**
 * Liveness endpoint on the port the Go workers already use, for the same reason: Kubernetes needs a
 * probe target and a Temporal worker serves no traffic of its own. Not the Fastify app — starting
 * the API inside the worker would give it the API's ports, plugins and failure modes, which is the
 * opposite of why this is a separate Deployment.
 */
function startHealthServer(): ReturnType<typeof createServer> {
  const server = createServer((req, res) => {
    if (req.url === '/health/live' || req.url === '/health/ready') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', queues: QUEUES }));
      return;
    }
    res.writeHead(404).end();
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  server.listen(HEALTH_PORT, () => {
    logger.info({ port: HEALTH_PORT }, 'file_service.workers.health.listening');
  });
  return server;
}

export async function runAllFileServiceWorkers(): Promise<void> {
  const health = startHealthServer();
  logger.info({ queues: QUEUES }, 'file_service.workers.starting');

  try {
    // Promise.all, not allSettled: losing one queue while the other keeps running is the failure
    // mode OQ-32 describes — a pod that looks healthy and is not doing half the work. Die, and let
    // Kubernetes restart the whole thing.
    await Promise.all([runFileCleanupWorker(), runZipExtractionWorker()]);
  } finally {
    health.close();
  }

  logger.info({ queues: QUEUES }, 'file_service.workers.stopped');
}

if (require.main === module) {
  runAllFileServiceWorkers().catch((err) => {
    logger.error({ err }, 'file_service.workers.fatal');
    process.exit(1);
  });
}
