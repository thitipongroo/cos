---
paths:
  - "packages/@cos/logger/**"
  - "packages/@cos/tracing/**"
  - "infrastructure/monitoring/**"
  - "libs/go/cosotel/**"
  - "services/ai-gateway/otel.py"
  - "**/*logger*.ts"
---

# QM-8 — Observability Standards

Indexed in: `context.md` §QUALITY MANDATES

Every new service, module, or background job must include:

**Structured Logging (JSON):**

```json
{
  "timestamp": "ISO8601",
  "level": "info|warn|error",
  "trace_id": "opentelemetry-trace-id",
  "span_id": "opentelemetry-span-id",
  "tenant_id": "uuid",
  "user_id": "uuid",
  "service": "cos-backend",
  "module": "procurement",
  "event": "purchase-order.created",
  "durationMs": 45,
  "metadata": {}
}
```

- Never use `console.log` — always use the platform logger (`@cos/logger`)
- PII must never appear in log fields — use IDs only
- Log level discipline: DEBUG = dev only, INFO = business events, WARN = recoverable anomaly, ERROR = requires investigation
- **Log retention** — production logs stored in **Loki** (30 days hot on S3 object storage); 1 year cold; compliance archive retained 7 years (source: spec §31.2 + master Phase 15; CloudWatch Logs removed; Loki is the authoritative log store); retention schedule defined in `docs/policies/log-retention-policy.md`

**Distributed Tracing:**

- All HTTP requests must propagate `traceparent` header (W3C Trace Context)
- All Kafka events must carry `trace_id` and `span_id` in headers
- All cross-service calls must create child spans
- **Sampling strategy** — tail-based sampling in production: 1% baseline of all requests; 100% of requests with errors (`4xx`/`5xx` responses); 100% of all AI/LLM calls; 100% of all financial transactions (source: spec §31.5 — "head-based" corrected to "tail-based"; tail-based captures all error traces regardless of baseline sample rate); sampling config in `infrastructure/monitoring/otel-collector/otel-collector-config.yml` (sampling section). **No SDK may head-sample** (ADR-075): the Go (`libs/go/cosotel`), Python (`services/ai-gateway/otel.py`) and Node (`@cos/tracing`) SDKs export EVERY span and the Collector's `tail_sampling` processor decides — a head sampler drops spans before the Collector can apply the error/AI/financial policies, so those "100%" guarantees silently fail. The baseline is set by `OTEL_SAMPLING_PERCENTAGE` (PERCENT 0–100, not a ratio) injected into the Collector Deployment; per spec §31.5 development=100, staging=10, production=1. Collector 0.103.0 accepts only `${env:VAR}` — `${VAR:-default}` makes it refuse to start

**Metrics:**

- All Temporal workflows: emit `workflow.started`, `workflow.completed`, `workflow.failed` counters
- All AI/LLM calls: emit `llm.tokens_used`, `llm.latency_ms`, `llm.model` metrics
- All background jobs: emit `job.duration_ms`, `job.success`, `job.failure` metrics
- **SLO burn rate** — emit `slo.error_budget_remaining` and `slo.burn_rate_1h` per SLO defined in QM-14; alert when burn rate exceeds 2× sustained for 1 hour, or 10× for 5 minutes

**Alerts:**

- Every new service must have corresponding **Alertmanager** alert rules defined (Prometheus ecosystem — source: spec §31.7 + master Phase 15; M-11 — CloudWatch alarms removed; Alertmanager is the authoritative alerting system); alert YAML in `infrastructure/monitoring/`
- Minimum alerts: error rate > 1% for > 5 min, p99 latency > 3s for > 5 min, job failure rate > 5%
- **Synthetic monitoring** — health-check probes run every 60 seconds from ≥ 2 AWS regions against all public endpoints; implemented via OpenTelemetry Collector + Grafana Synthetic Monitoring (source: spec §31.10 + master Phase 15; probe definitions in `infrastructure/synthetics/`)
- **Notification escalation timeouts (spec §19.3)** — distinct from the §15.5 48h _approval_ escalation: safety incident unacknowledged 30 min → escalate to PM; budget alert unacknowledged 2 h → escalate to Executive; AI risk prediction unacknowledged 24 h → escalate to PM. **Critical safety notifications cannot be disabled or quieted** (override quiet hours / preferences — spec §19.6). Digest + quiet-hours delivery config: 00_master §Phase 20 (spec §19.3/§19.6)
