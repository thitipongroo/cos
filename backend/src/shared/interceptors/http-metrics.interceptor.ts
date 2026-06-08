import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { createMetrics } from '@cos/tracing';

const _metrics = createMetrics();

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<{
      method: string;
      routerPath?: string;
      url: string;
    }>();
    const method = req.method ?? 'UNKNOWN';
    const path = req.routerPath ?? req.url ?? 'unknown';
    const start = performance.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = ctx.switchToHttp().getResponse<{ statusCode: number }>();
          this._record(method, path, res.statusCode ?? 200, start);
        },
        error: () => {
          this._record(method, path, 500, start);
        },
      }),
    );
  }

  private _record(method: string, path: string, status: number, start: number): void {
    const durationSec = (performance.now() - start) / 1000;
    const attrs = { method, path, status: String(status) };
    _metrics.httpRequestDuration.record(durationSec, attrs);
    _metrics.httpRequestsTotal.add(1, attrs);
  }
}
