import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { METRICS_RECORDED, httpMetrics, statusOfError } from './http-metrics.shared';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<{
      method: string;
      routerPath?: string;
      url: string;
      [METRICS_RECORDED]?: boolean;
    }>();
    const method = req.method ?? 'UNKNOWN';
    const path = req.routerPath ?? req.url ?? 'unknown';
    const start = performance.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = ctx.switchToHttp().getResponse<{ statusCode: number }>();
          req[METRICS_RECORDED] = true;
          this._record(method, path, res.statusCode ?? 200, start);
        },
        error: (err: unknown) => {
          // THE STATUS THE CLIENT ACTUALLY GOT, not a blanket 500.
          //
          // This branch used to record 500 for every failure, so a 400 from validation, a 403 from
          // a guard and a 409 conflict all arrived in the metric as server errors. The mandatory
          // APIHighErrorRate alert is `http_requests_total{status=~"5.."} / total > 1%` at severity
          // critical (master:4382) — meaning a mobile build sending a bad payload, or any burst of
          // client errors, paged on-call for a fault that never happened, while a genuine 5xx was
          // indistinguishable from them in the same series.
          //
          // A non-HttpException is a real unhandled fault and stays 500, which is what the
          // exception filter will return for it too.
          req[METRICS_RECORDED] = true;
          this._record(method, path, statusOfError(err), start);
        },
      }),
    );
  }

  private _record(method: string, path: string, status: number, start: number): void {
    const durationSec = (performance.now() - start) / 1000;
    const attrs = { method, path, status: String(status) };
    httpMetrics.httpRequestDuration.record(durationSec, attrs);
    httpMetrics.httpRequestsTotal.add(1, attrs);
  }
}
