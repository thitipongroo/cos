// Temporal worker entrypoint — the process that actually executes the backend's workflows.
//
// WHY THIS FILE EXISTS
// --------------------
// Three worker files already existed — procurement, enterprise-provisioning and data-export — each
// exporting a `run*Worker()` and each self-starting under `require.main === module`. Nothing ever
// started any of them: no package.json script, no Dockerfile, no Compose service, no CI step, no
// Helm chart, and no row in 32-implementation-specifications §32.2. The Temporal SERVER is deployed
// (docker-compose.yml, profile `full`), so every workflow those services start was accepted and
// recorded as Running while no worker polled its task queue.
//
// What that cost, concretely: ProcurementService.publishRfq only signals — the status write and the
// Kafka event live in `rfq.activities`. So `POST /procurement/rfqs/:id/publish` returned 200 and the
// RFQ stayed DRAFT forever, no `procurement.rfq.status_changed.v1` was ever emitted, and the RFQ
// deadline timer never fired. The workflow unit tests pass because `TestWorkflowEnvironment` starts
// its own in-process worker; nothing in the gate set checks that a built component is reachable in
// production. See docs/architecture/technical-design/README.md OQ-32.
//
// Product-owner decision 2026-08-22: run the workers as their OWN Deployment, separate from the API.
// A worker crash-loop must not take the request path down with it, and worker replicas scale on
// queue depth rather than on HTTP load.
//
// WHY ONE PROCESS FOR THREE QUEUES
// --------------------------------
// A Temporal Worker is bound to one task queue, so three queues need three Workers — but not three
// processes. None of the three needs a Nest application context: their activities are module-level
// functions holding their own pooled Prisma clients (procurement/workflows/activity-helpers.ts), so
// they compose in one process with `Promise.all`. Three Deployments would triple the chart,
// HPA, PDB and image-pull cost for no isolation that matters, since all three share the same
// database and the same failure domains.
//
// The file-service workers (file-cleanup, zip-extraction) are NOT started here — they live in a
// different image and get their own Deployment in the cos-file-service chart.

import { createServer } from 'http';
import { createLogger } from '@cos/logger';
import { runProcurementWorker } from '../modules/procurement/workflows/worker';
import { runEnterpriseProvisioningWorker } from '../modules/tenant/workflows/enterprise-provisioning.worker';
import { runDataExportWorker } from '../modules/identity/data-export/workflows/worker';

const logger = createLogger('temporal-worker');

/** Queues this process serves. Kept as data so the health payload and the log agree by construction. */
const QUEUES = ['procurement', 'enterprise-provisioning', 'data-export'] as const;

const HEALTH_PORT = Number(process.env['WORKER_HEALTH_PORT'] ?? 8090);

/**
 * Minimal health server, matching what the Go workers already expose on 8090 (`/health/live`).
 *
 * A Temporal worker serves no HTTP traffic of its own, but Kubernetes still needs a probe target and
 * Phase 19's readiness checklist asserts every service has liveness + readiness probes configured.
 * Deliberately NOT a Nest app: pulling the whole DI container into the worker process would give it
 * the API's startup cost and the API's failure modes, which is the opposite of why it is a separate
 * Deployment.
 *
 * Liveness only. There is no readiness signal a worker can honestly give — it polls an outbound queue
 * rather than accepting traffic — so the chart points both probes at the same path, as the Go workers
 * do.
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
  // Explicit timeouts: the Node defaults leave a socket open indefinitely, which on a probe endpoint
  // means a stuck kubelet connection can accumulate until the process runs out of handles.
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  server.listen(HEALTH_PORT, () => {
    logger.info({ port: HEALTH_PORT }, 'temporal_worker.health.listening');
  });
  return server;
}

export async function runAllBackendWorkers(): Promise<void> {
  const health = startHealthServer();
  logger.info({ queues: QUEUES }, 'temporal_worker.starting');

  try {
    // Promise.all, not allSettled: if any one worker dies the process must die too, so Kubernetes
    // restarts it. A process that keeps serving two queues while silently having lost the third is
    // exactly the failure OQ-32 is about — present, healthy-looking, and not doing the work.
    await Promise.all([
      runProcurementWorker(),
      runEnterpriseProvisioningWorker(),
      runDataExportWorker(),
    ]);
  } finally {
    health.close();
  }

  // Reached when every Worker.run() has resolved, which happens on SIGTERM/SIGINT — the Temporal SDK
  // registers those handlers itself and shuts each worker down gracefully, letting in-flight
  // activities finish. Nothing to do here but let the process exit 0.
  logger.info({ queues: QUEUES }, 'temporal_worker.stopped');
}

if (require.main === module) {
  runAllBackendWorkers().catch((err) => {
    logger.error({ err }, 'temporal_worker.fatal');
    process.exit(1);
  });
}
