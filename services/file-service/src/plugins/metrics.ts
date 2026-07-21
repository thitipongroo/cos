// HTTP metrics (§31.3, QM-8). file-service was declared as a Prometheus target — prometheus.yml
// scrapes file-service:9464 and the Helm chart annotates the pod for scraping — but nothing ever
// opened that port or emitted a metric, so the target could never come up and a real outage was
// indistinguishable from the permanently-down scrape. initTracing() in main.ts starts the exporter;
// this hook fills it with the two request metrics §31.3 requires of every service.
//
// Labels match backend/src/shared/interceptors/http-metrics.interceptor.ts exactly ({method, path,
// status}) so a single Grafana panel can query both services. `path` is the route *pattern*
// (/api/v1/files/:fileId), never the raw URL, so file ids do not explode cardinality or leak into
// metric labels.
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { createMetrics } from '@cos/tracing';

const metrics = createMetrics();

export const metricsPlugin = fp(async (app: FastifyInstance) => {
  app.addHook('onResponse', async (request, reply) => {
    const attrs = {
      method: request.method,
      path: request.routeOptions?.url ?? 'unknown',
      status: String(reply.statusCode),
    };
    // Fastify measures this for us; elapsedTime is milliseconds, the metric is seconds (§31.3).
    metrics.httpRequestDuration.record(reply.elapsedTime / 1000, attrs);
    metrics.httpRequestsTotal.add(1, attrs);
  });
});
