# ADR-044: OpenTelemetry JS SDK upgrade (sdk-node 0.51 → 0.219)

**Date:** 2026-07-01
**Status:** Accepted
**Deciders:** Product owner / engineering lead
**Tags:** infra, architecture

---

## Context

The Node/JS OpenTelemetry stack in `@cos/tracing` (the shared `initTracing`/`shutdownTracing` used by
the backend + services, QM-8) was pinned to `@opentelemetry/sdk-node@0.51` with `resources@1.24`.
`pnpm-workspace.yaml` `auditConfig` held a CVE-ignore open on this ("Locked by
@opentelemetry/sdk-node@0.51 — needs full OTel stack upgrade"). The Python OTel stack was already
moved to 1.43 / 0.64b0 (ADR-independent, Wave B) and the Go OTel to 1.44 (Wave A); this ADR covers
the remaining JS/Node stack.

The jump to sdk-node 0.219 pulls `@opentelemetry/resources` across a major (1 → 2), which removes the
`new Resource(...)` constructor.

## Decision

Bump the `@cos/tracing` OpenTelemetry packages: `sdk-node` 0.51 → 0.219,
`auto-instrumentations-node` 0.46 → 0.77, `exporter-prometheus` + `exporter-trace-otlp-http`
0.51 → 0.219, `resources` 1.24 → 2.8, `api` → 1.9.1 (and the backend's `sdk-node` +
`auto-instrumentations-node` to match). Replace `new Resource({...})` with the v2
`resourceFromAttributes({...})` factory in `otel.ts`. The `NodeSDK` config (traceExporter,
metricReader = PrometheusExporter, instrumentations) is otherwise unchanged. Clear the now-unblocked
OTel CVE-ignore.

Verified: `@cos/tracing` unit suite (100% coverage), full build/type-check, backend integration +
Docker health (the SDK starts + shuts down cleanly, ADR-034).

## Rationale

The OTel-0.51 lock exists only to defer this bump; 0.219 is current and reopens the held CVE. The
only breaking surface for this codebase is the Resource factory change — the NodeSDK bootstrap and
exporter wiring are stable.

## Consequences

### Positive

- OTel JS current; CVE-ignore for sdk-node 0.51 removed; parity with the already-upgraded Python/Go
  OTel stacks.

### Negative

- None beyond the Resource API edit.

### Neutral

- Collector config (`infrastructure/monitoring/otel-collector`) unchanged — the OTLP/HTTP wire
  protocol is stable across this range.

## References

- QM-8 (observability), ADR-034 (graceful SDK shutdown); `pnpm-workspace.yaml` `auditConfig`;
  `@opentelemetry/resources` v2 migration (resourceFromAttributes)
