/**
 * Shared between HttpMetricsInterceptor and UnmatchedRouteMetricsMiddleware.
 *
 * The interceptor covers every request that reaches a route. The middleware covers the ones that
 * never do — a path no controller serves is answered by the framework before any interceptor runs,
 * so without it a flood of 404s (a scanner, a client built against the wrong prefix, a deploy that
 * moved a path) is absent from http_requests_total entirely.
 *
 * They must not both count the same request, hence this marker: the interceptor stamps the request
 * once it has recorded, and the middleware records on response-finish only when the stamp is
 * missing.
 */
import { createMetrics } from '@cos/tracing';

/** Set on the request object by whichever layer recorded it. */
export const METRICS_RECORDED = Symbol.for('cos.httpMetricsRecorded');

/**
 * One shared instrument pair.
 *
 * `createMetrics()` builds new instruments on each call; two callers would produce two series with
 * the same name, which OpenTelemetry reports as a duplicate-instrument conflict.
 */
export const httpMetrics = createMetrics();

/** The HTTP status an error resolves to — the same one the exception filter will send. */
export function statusOfError(err: unknown, fallback = 500): number {
  const status = (err as { status?: unknown; getStatus?: () => number } | null)?.status;
  if (typeof (err as { getStatus?: () => number })?.getStatus === 'function') {
    return (err as { getStatus: () => number }).getStatus();
  }
  // Some libraries throw a plain object carrying a status; trust it only when it is a real code, or
  // a library using `status` for its own enum could write nonsense into the label the error-rate
  // alert groups on.
  if (typeof status === 'number' && status >= 100 && status <= 599) return status;
  return fallback;
}
