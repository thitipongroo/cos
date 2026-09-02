# Phase 15 — Observability

> Moved out of `context/00_master_construction_os.md` on 2026-09-02, verbatim.
> That file keeps the index row pointing here; `.claude/skills/phase-index/SKILL.md`
> is the map. Depends on Phase 1–14, 20–25 · SaaS Maturity Stage —.
>
> Rule 36 applies at the end of this phase and Rule 38 before it starts.

```text
Build observability stack.

Tools:
  Metrics:  Prometheus 2.x + Grafana 10.x
  Logs:     Loki 3.x + Grafana
  Tracing:  Jaeger 1.x + OpenTelemetry Collector
  SDK:      OpenTelemetry (@cos/tracing package from Phase 1)

Metrics to instrument (mandatory per service):
  http_request_duration_seconds (histogram, labels: service, method, path, status)
  http_requests_total (counter, labels: service, endpoint, method, status_code, tenant_tier) — spec §31.3
  kafka_messages_produced_total (counter, labels: service, topic)
  kafka_messages_consumed_total (counter, labels: service, topic, consumer_group)
  kafka_consumer_lag (gauge)
  kafka_dlq_depth (gauge, alert: > 0)
  db_query_duration_seconds (histogram)
  ai_token_usage_total (counter, labels: model, template)
  ai_request_duration_seconds (histogram, labels: model)
  sync_queue_depth (gauge — mobile sync queue)
  file_upload_bytes_total (counter)
  workflow_started_total (counter, labels: workflow_type) — spec §31.3
  workflow_completed_total (counter, labels: workflow_type, outcome) — spec §31.3
  approval_pending_duration_seconds (histogram, labels: workflow_type) — spec §31.3
  llm_request_duration_seconds (histogram, labels: model) — spec §31.3 AI metrics
  llm_tokens_consumed_total (counter, labels: tenant_id, model) — spec §31.3 AI metrics
  rag_retrieval_duration_seconds (histogram) — spec §31.3 AI metrics
  ocr_pages_processed_total (counter, labels: tenant_id) — spec §31.3 AI metrics
  notification_delivery_duration_seconds (histogram, labels: channel, notification_type) — spec §31.3; Notification Service
  notification_pending_total (gauge, labels: notification_type) — spec §31.3; Notification Service polls PostgreSQL every 30s
  active_sessions_total (gauge, labels: tenant_id) — spec §31.3; Identity Service (JWT issue/expiry)
  storage_used_bytes (gauge, labels: tenant_id, storage_type) — spec §31.3; backend telemetry job (postgresql|s3)
  tenant_isolation_check_result (gauge, labels: check_name) — spec §31.3; synthetic probe CronJob (spec §30.6)

Alerting rules (mandatory):
  KafkaDLQNonEmpty:            kafka_dlq_depth > 0 for 5 min
  APIHighErrorRate:            http_requests_total{status=~"5.."} / total > 1% for 5 min
  APIHighLatency:              http_request_duration_seconds P99 > 5s for 5 min
  DBHighQueryTime:             db_query_duration_seconds P95 > 1s for 5 min
  AnalyticsSLABreach:          http_request_duration_seconds{path="/api/v1/analytics/*"} P95 > 3s
  AIHighTokenUsage:            ai_token_usage_total > 80% of tenant monthly quota — alert FINANCE and TENANT_ADMIN (see spec §31-monitoring-observability)
  ServiceDown:                 pod not ready for > 2 min — page on-call; severity: critical (spec §31.7)
  DBConnectionExhausted:       PostgreSQL connection pool > 95% — page on-call; severity: critical (spec §31.7)
  KafkaConsumerLagCritical:    consumer lag > 50,000 messages on any topic — page on-call; severity: critical (spec §31.7)
  SafetyNotificationFailed:    notification_pending_total{notification_type="safety"} > 0 — page security; severity: critical (spec §31.7)
  TenantIsolationBreach:       tenant_isolation_check_result == 0 (synthetic probe CronJob every 5 min — spec §30.6) — page security lead immediately; severity: critical (spec §31.7)
  DiskUsageHigh:               any PV > 80% full — Slack notification; severity: warning (spec §31.7)
  MemoryPressure:              pod memory > 85% of limit for > 10 min — Slack notification; severity: warning (spec §31.7)

Distributed Tracing:
  All NestJS services: trace every HTTP request, Kafka produce/consume, DB query
  FastAPI services: trace every HTTP request, LLM provider API call, embedding call
  Go workers: trace every Kafka consume iteration and DB write
  Trace propagation: W3C TraceContext headers on HTTP, Kafka headers for async
  Sampling: 1% of requests in production (100% for errors — tail-based sampling; source: spec §31.5 — production rate corrected from 10% staging rate to 1% production rate)
    Sampling happens ONLY at the OTel Collector (ADR-075). No SDK — Go (libs/go/cosotel), Python
    (services/ai-gateway/otel.py) or Node (@cos/tracing) — may configure a sampler: head-sampling
    discards spans inside the service, before the Collector's tail_sampling can apply its
    error / AI-LLM / financial policies, so the "100% for errors" guarantee silently fails.
    Baseline set via OTEL_SAMPLING_PERCENTAGE (PERCENT 0–100, NOT a ratio) on the Collector
    Deployment; per §31.5 development=100, staging=10, production=1. Collector 0.103.0 accepts
    only ${env:VAR} — the older ${VAR:-default} form makes the Collector refuse to start.

Grafana Dashboards (required):
  Implementation dashboards (technology-based — spec §31.8):
  - Per-service: latency P50/P95/P99, error rate, throughput
  - Kafka: consumer lag per group, DLQ depth, throughput
  - Database: connection pool, slow query count, index hit rate
  - AI: token usage per tenant, latency per model, error rate
  - Infrastructure: CPU, memory, disk per pod (Kubernetes metrics)
  Audience dashboards (purpose-based — spec §31.8):
  - Platform Overview: service health matrix (all pods), request rate/error rate, active tenants, Kafka lag summary
  - Tenant Operations (per tenant): API volume/latency (Prometheus), active users (active_sessions_total gauge), storage usage (storage_used_bytes gauge), AI token quota (llm_tokens_consumed_total)
  - Business Metrics (internal): daily active tenants (PostgreSQL audit_logs), procurement value THB (PostgreSQL purchase_orders), site reports (ClickHouse site_activity_daily), approval completion rate (Prometheus workflow metrics)
  - SLO Burn Rate: error budget remaining per tier (30-day), fast burn (1h), slow burn (6h), historical SLO compliance
  Dashboard IDs and SLO targets per dashboard: docs/registers/dashboard-registry.md (source: spec §31.8)

Generate:

- OpenTelemetry setup in @cos/tracing package (NestJS + FastAPI + Go)
- Prometheus scrape configs for all services
- Grafana dashboard JSON definitions (all dashboards above)
- Loki log pipeline configs (structured JSON logs from all services)
- Jaeger deployment manifests
- OpenTelemetry Collector config (receives from services, exports to Jaeger + Prometheus)
- Alert rule YAML for all alerting rules above
- NestJS interceptor for automatic HTTP metrics
- Kafka metrics middleware for producer/consumer
- Unit tests: metric collection, trace propagation
- Log retention schedule: docs/policies/log-retention-policy.md
  (application logs 30-day hot / 1-year cold; audit logs indefinite / 7-year WORM — source: spec §31.4)
- Synthetic health check probe definitions: infrastructure/synthetics/
  (≥2 AWS regions, 60s interval, OTel Collector + Grafana Synthetic Monitoring;
  adding a new endpoint requires a probe definition in the same PR — source: spec §31.10)

Constraints:

- Before marking Phase 15 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```
