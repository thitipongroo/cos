// @cos/tracing — OpenTelemetry setup and trace utilities
// QM-8: all HTTP requests must propagate traceparent header (W3C Trace Context)
// QM-8: all Kafka events must carry trace_id and span_id in headers
// Phase 15 adds the full OTel collector config

export * from './otel';
