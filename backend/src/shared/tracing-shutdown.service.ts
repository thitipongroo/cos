import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { shutdownTracing } from '@cos/tracing';

/**
 * Closes the OpenTelemetry SDK (and its Prometheus exporter HTTP server, opened by initTracing in
 * main.ts) during graceful shutdown. The OTel SDK is started outside the Nest DI container, so no
 * provider's onModuleDestroy reaches it — without this hook its metrics server lingers when the
 * process receives SIGTERM. onApplicationShutdown runs last in the Nest lifecycle, after all spans
 * have had a chance to flush. shutdownTracing() is a no-op if tracing was never initialized.
 */
@Injectable()
export class TracingShutdownService implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    await shutdownTracing();
  }
}
