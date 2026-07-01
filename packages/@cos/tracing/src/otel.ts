import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { context, metrics, trace } from '@opentelemetry/api';

let sdk: NodeSDK | null = null;

export interface TracingOptions {
  serviceName: string;
  serviceVersion?: string;
  /** OTLP HTTP endpoint base URL. Defaults to OTEL_EXPORTER_OTLP_ENDPOINT env or http://localhost:4318 */
  otlpEndpoint?: string;
  /** Prometheus scrape port. Defaults to PROMETHEUS_PORT env or 9464 */
  prometheusPort?: number;
  /**
   * Tail-sampling ratio 0–1. Defaults to OTEL_SAMPLING_RATIO env or 0.01 (1% production).
   * Errors are always sampled regardless of this ratio (configured on the OTel Collector).
   */
  samplingRatio?: number;
}

export function initTracing(serviceNameOrOptions: string | TracingOptions): void {
  const opts: TracingOptions =
    typeof serviceNameOrOptions === 'string'
      ? { serviceName: serviceNameOrOptions }
      : serviceNameOrOptions;

  const {
    serviceName,
    serviceVersion = process.env.SERVICE_VERSION ?? '0.0.0',
    otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318',
    prometheusPort = parseInt(process.env.PROMETHEUS_PORT ?? '9464', 10),
  } = opts;

  // @opentelemetry/resources v2 removed `new Resource(...)` in favour of the resourceFromAttributes
  // factory (ADR-044).
  const resource = resourceFromAttributes({
    'service.name': serviceName,
    'service.version': serviceVersion,
  });

  sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` }),
    metricReader: new PrometheusExporter({ port: prometheusPort }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
}

export async function shutdownTracing(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = null;
  }
}

/** Returns the W3C trace-id hex string of the currently active span, or 32 zeros if no span is active. */
export function getTraceId(): string {
  const span = trace.getSpan(context.active());
  if (!span) return '0'.repeat(32);
  return span.spanContext().traceId;
}

/** Returns the W3C span-id hex string of the currently active span, or 16 zeros if no span is active. */
export function getSpanId(): string {
  const span = trace.getSpan(context.active());
  if (!span) return '0'.repeat(16);
  return span.spanContext().spanId;
}

/** Returns the current OTel meter for a given instrumentation scope. */
export function getMeter(name: string, version?: string) {
  return metrics.getMeter(name, version);
}
