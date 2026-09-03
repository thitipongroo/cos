# @cos/tracing

OpenTelemetry setup and trace utilities for W3C Trace Context propagation.

## Purpose

Initialises the OpenTelemetry SDK for all Node.js services and provides helpers to propagate `traceparent`
headers across HTTP and Kafka calls (QM-8). All HTTP requests must propagate `traceparent`; all Kafka events
must carry `trace_id` and `span_id` in headers.

Full OTel collector configuration is a Phase 15 deliverable (`infrastructure/monitoring/otel-collector-config.yaml`).

## Public API

```typescript
import {
  initTracing,
  shutdownTracing,
  getTraceId,
  getSpanId,
  injectTraceContext,
} from '@cos/tracing';
```

### `initTracing(serviceName): void`

Initialises the OTel SDK with OTLP exporter. Call once at service startup before any other imports.

### `shutdownTracing(): Promise<void>`

Gracefully flushes and shuts down the OTel provider. Call in `onApplicationShutdown`.

### `getTraceId(): string | undefined`

Returns the current W3C `traceId` from the active span context.

### `getSpanId(): string | undefined`

Returns the current `spanId`.

### `injectTraceContext(headers: Record<string, string>): void`

Injects `traceparent` and `tracestate` into an outgoing headers object (HTTP or Kafka).

## Dependencies

- `@opentelemetry/sdk-node`
- `@opentelemetry/exporter-trace-otlp-http`
- `@opentelemetry/auto-instrumentations-node`

## Configuration

| Variable                      | Description                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `OTEL_SERVICE_NAME`           | Service name tag on all spans                                                  |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTel Collector HTTP endpoint (default: `http://otel-collector:4318`)           |
| `OTEL_TRACES_SAMPLER`         | `parentbased_traceidratio` (production: 1% baseline, 100% errors — tail-based) |

## Usage

```typescript
// In main.ts — MUST be the very first import
import { initTracing } from '@cos/tracing';
initTracing(process.env.OTEL_SERVICE_NAME ?? 'cos-backend');

// Inject into outgoing Kafka message headers
import { injectTraceContext } from '@cos/tracing';
const headers: Record<string, string> = {};
injectTraceContext(headers);
producer.send({ topic, messages: [{ value, headers }] });

// In a log entry
import { getTraceId, getSpanId } from '@cos/tracing';
logger.info({ traceId: getTraceId(), spanId: getSpanId(), ...ctx }, 'msg');
```

## Notes

- Sampling: tail-based in production — 1% baseline; 100% of `4xx`/`5xx`; 100% of AI calls; 100% of financial transactions
- Sampling config: `infrastructure/monitoring/otel-collector-config.yaml` (Phase 15)
- Go workers and Python FastAPI services use their own OTel SDKs but propagate the same `traceparent` header
