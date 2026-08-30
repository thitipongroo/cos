/**
 * Counts requests that never reach a route (master:4357 — http_requests_total per service).
 *
 * WHY A MIDDLEWARE AND NOT THE INTERCEPTOR. A global Nest interceptor runs inside the route
 * pipeline, so a path no controller serves is answered by the framework before any interceptor is
 * reached. Every such request was therefore missing from http_requests_total: a scanner, a mobile
 * build compiled against the wrong API prefix, or a deploy that moved a path produced no traffic at
 * all as far as the metrics were concerned — the one situation where you most want to see a spike.
 *
 * Middleware runs before routing resolves, so it sees everything. To avoid counting the same
 * request twice, it records on response-finish only when the interceptor has NOT stamped the
 * request (see http-metrics.shared.ts).
 *
 * The path label is deliberately NOT the raw URL: an unmatched path is attacker- or
 * client-controlled, and one series per distinct 404 URL is a cardinality explosion that would take
 * Prometheus down long before anyone read the dashboard.
 */
import { Injectable, NestMiddleware } from '@nestjs/common';
import { METRICS_RECORDED, httpMetrics, statusOfError } from '../interceptors/http-metrics.shared';

/** Every unmatched request shares one label value — see the note above on cardinality. */
export const UNMATCHED_PATH_LABEL = '(unmatched)';

interface MetricsRequest {
  method?: string;
  [METRICS_RECORDED]?: boolean;
}

interface MetricsResponse {
  statusCode?: number;
  on?: (event: string, listener: () => void) => void;
}

@Injectable()
export class UnmatchedRouteMetricsMiddleware implements NestMiddleware {
  use(req: MetricsRequest, res: MetricsResponse, next: () => void): void {
    const start = performance.now();

    // `finish` fires once the response has been flushed, which is the only point at which both the
    // status and whether a route handled it are known.
    res.on?.('finish', () => {
      if (req[METRICS_RECORDED]) return;

      const attrs = {
        method: req.method ?? 'UNKNOWN',
        path: UNMATCHED_PATH_LABEL,
        status: String(statusOfError(null, res.statusCode ?? 404)),
      };
      httpMetrics.httpRequestDuration.record((performance.now() - start) / 1000, attrs);
      httpMetrics.httpRequestsTotal.add(1, attrs);
    });

    next();
  }
}
