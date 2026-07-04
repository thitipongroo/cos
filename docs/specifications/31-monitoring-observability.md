---
title: 'Monitoring & Observability'
version: '1.9.0'
status: Active
last_updated: '2026-07-04'
authors:
  - thitipongroo
related_docs:
  - 04-tech-stack.md
  - 08-enterprise-deployment.md
  - 15-event-driven-workflow.md
  - 19-notification-architecture.md
  - 30-testing-strategy.md
---

# 31. Monitoring & Observability

## Table of Contents

- [31.1 Observability Philosophy](#311-observability-philosophy)
- [31.2 Observability Stack](#312-observability-stack)
- [31.3 Metrics](#313-metrics)
- [31.4 Logging](#314-logging)
- [31.5 Distributed Tracing](#315-distributed-tracing)
- [31.6 Service Level Objectives (SLOs)](#316-service-level-objectives-slos)
- [31.7 Alerting Rules](#317-alerting-rules)
- [31.8 Dashboards](#318-dashboards)
- [31.9 On-call & Incident Response](#319-on-call--incident-response)
- [31.10 Synthetic Monitoring](#3110-synthetic-monitoring)
- [31.11 Resilience Validation (Chaos & Game-day)](#3111-resilience-validation-chaos--game-day)
- [31.12 Delivery Metrics (DORA)](#3112-delivery-metrics-dora)

---

## 31.1 Observability Philosophy

The three pillars of observability — **metrics, logs, and traces** — MUST be in place
before a service goes to production. Observability is not optional.

Principle:

> If you cannot measure it, you cannot operate it.

Every service and deployable unit (see `03-system-design` section 3.2) must emit all three
signal types from Day 1. Dark deployments (services with no observability) are not permitted.

Note: The platform is a **Modular Monolith** (NestJS), not microservices — see 03-system-design
§3.1. "Service" in this document refers to the logical modules and independent deployable units
defined in 32-implementation-specifications §32.2, not separately deployed microservices.

---

## 31.2 Observability Stack

Tooling from `04-tech-stack` section 4.5:

| Signal          | Tool              | Storage                                | Retention                                          |
| --------------- | ----------------- | -------------------------------------- | -------------------------------------------------- |
| Metrics         | Prometheus        | Prometheus TSDB                        | 15 days hot; long-term via Thanos or Grafana Mimir |
| Logs            | Loki              | Object storage (S3)                    | 30 days hot; 1 year cold                           |
| Traces          | Jaeger            | Elasticsearch / S3                     | 7 days hot                                         |
| Dashboards      | Grafana           | —                                      | Persisted as code (GitOps)                         |
| Instrumentation | OpenTelemetry SDK | Collector → Prometheus / Loki / Jaeger | —                                                  |

All services instrument via the **OpenTelemetry SDK** (Node.js, Python). The OpenTelemetry
Collector routes signals to the appropriate backend. No direct Prometheus/Loki/Jaeger SDK
coupling in application code.

---

## 31.3 Metrics

### Infrastructure Metrics (auto-collected by Prometheus)

- Kubernetes pod CPU and memory utilisation
- Node disk I/O and network throughput
- PostgreSQL connection pool saturation
- Kafka consumer lag per topic per consumer group
- Redis memory and hit rate

### Application Metrics (emitted via OpenTelemetry)

Every NestJS service must expose:

| Metric                                    | Type      | Labels                                              |
| ----------------------------------------- | --------- | --------------------------------------------------- |
| `http_request_duration_seconds`           | Histogram | service, endpoint, method, status_code, tenant_tier |
| `http_requests_total`                     | Counter   | service, endpoint, method, status_code, tenant_tier |
| `db_query_duration_seconds`               | Histogram | service, query_type                                 |
| `kafka_messages_produced_total`           | Counter   | service, topic                                      |
| `kafka_messages_consumed_total`           | Counter   | service, topic, consumer_group                      |
| `workflow_started_total`                  | Counter   | workflow_type                                       |
| `workflow_completed_total`                | Counter   | workflow_type, outcome (success/failed/timeout)     |
| `approval_pending_duration_seconds`       | Histogram | workflow_type                                       |
| `notification_delivery_duration_seconds`  | Histogram | channel, notification_type                          |
| `notification_pending_total`              | Gauge     | notification_type                                   |
| `active_sessions_total`                   | Gauge     | tenant_id                                           |
| `storage_used_bytes`                      | Gauge     | tenant_id, storage_type (postgresql \| s3)          |
| `tenant_isolation_check_result`           | Gauge     | check_name                                          |

**Metric emitters:**

- `notification_delivery_duration_seconds`, `notification_pending_total` — Notification Service;
  queries PostgreSQL (`delivered_at IS NULL AND created_at < NOW()-5m`) every 30 s.
- `active_sessions_total` — Identity Service; updated on JWT issue/expiry/logout.
- `storage_used_bytes` — backend telemetry job; `storage_type=postgresql` from
  pg_relation_size per tenant, `storage_type=s3` from file-service bucket scan.
- `tenant_isolation_check_result` — synthetic probe CronJob (see §31.7); 1 = pass, 0 = fail.

### AI Service Metrics

| Metric                           | Type      | Description                                    |
| -------------------------------- | --------- | ---------------------------------------------- |
| `llm_request_duration_seconds`   | Histogram | LLM API call latency per provider              |
| `llm_tokens_consumed_total`      | Counter   | Input + output tokens per tenant, per provider |
| `rag_retrieval_duration_seconds` | Histogram | Vector search query latency                    |
| `ocr_pages_processed_total`      | Counter   | OCR pages processed per tenant                 |

---

## 31.4 Logging

### Log Format

All services emit **structured JSON logs** via the OpenTelemetry log signal:

```json
{
  "timestamp": "2026-05-24T08:00:00.000Z",
  "level": "info",
  "service": "procurement-service",
  "trace_id": "abc123",
  "span_id": "def456",
  "tenant_id": "tenant_abc",
  "user_id": "user_xyz",
  "message": "Purchase order approved",
  "po_id": "po_001",
  "amount": 450000,
  "approved_by": "user_xyz"
}
```

Mandatory fields in every log line:

- `timestamp` — ISO 8601
- `level` — debug / info / warn / error
- `service` — service name
- `trace_id` — OpenTelemetry trace ID (enables log-to-trace correlation in Grafana)
- `tenant_id` — always present for tenant-scoped operations; `"platform"` for system operations

### Log Levels

| Level   | When to Use                                                                                 |
| ------- | ------------------------------------------------------------------------------------------- |
| `debug` | Detailed diagnostic data (disabled in production by default)                                |
| `info`  | Normal business events (PO approved, delivery received, user logged in)                     |
| `warn`  | Unexpected but recoverable conditions (retry triggered, cache miss on hot path)             |
| `error` | Failures requiring investigation (DB connection lost, Kafka publish failed, sync exhausted) |

### PII in Logs

- Never log `contact_email`, `contact_phone`, `full_name`, or any PII field
- Log only entity IDs (e.g., `user_id`, `vendor_id`, `employee_id`) — not the human-readable values
- Required for PDPA and GDPR compliance (see `05-security-compliance` section 5.3)

### Audit Logs

Audit logs (approval decisions, System Admin actions, cross-tenant access) are
separate from application logs. They are written to an **immutable append-only store**
per `05-security-compliance` section 5.2. Audit logs are never deleted.

### Log Retention

| Log type         | Hot storage | Cold archive | Compliance archive |
| ---------------- | ----------- | ------------ | ------------------ |
| Application logs | 30 days     | 1 year       | —                  |
| Audit logs       | Indefinite  | —            | 7 years (WORM)     |

Authoritative retention schedule: `docs/compliance/log-retention-policy.md`

---

## 31.5 Distributed Tracing

### Instrumentation

- All HTTP requests are traced end-to-end from API Gateway (Kong) through the service chain
- Kafka message headers carry `trace_id` — consumers propagate the trace
- Database queries are traced via the OpenTelemetry auto-instrumentation for pg (Node.js)

### Sampling Strategy

| Environment | Sampling Rate                                       |
| ----------- | --------------------------------------------------- |
| Development | 100% (all requests)                                 |
| Staging     | 10% (representative sample)                         |
| Production  | 1% baseline + 100% for errors (tail-based sampling) |

Tail-based sampling ensures all error traces are captured regardless of baseline rate.

### Key Traces to Verify

- Full procurement lifecycle: PR create → RFQ → PO approve → delivery → vendor invoice approve
- Approval workflow: Temporal.io activity invocation → notification dispatch → approval signal
- Offline sync: mobile sync request → conflict resolution → DB write → event publish
- AI report generation: request → RAG retrieval → LLM call → response delivery

---

## 31.6 Service Level Objectives (SLOs)

SLOs define the target reliability for each tier. They underpin the SLAs defined in
`08-enterprise-deployment` section 8.2.

### API Availability SLO

| Tier                     | Monthly Availability Target | Error Budget (30 days) |
| ------------------------ | --------------------------- | ---------------------- |
| Shared SaaS — SMB        | 99.5%                       | 3.6 hours/month        |
| Shared SaaS — Mid-market | 99.9%                       | 43.8 minutes/month     |
| Dedicated / Enterprise   | 99.95%                      | 21.9 minutes/month     |

Availability = (total requests − error requests) / total requests
Errors: HTTP 5xx responses.

### Latency SLO

| Endpoint Category                  | p50      | p95      | p99      |
| ---------------------------------- | -------- | -------- | -------- |
| Read endpoints (GET)               | < 100 ms | < 300 ms | < 500 ms |
| Write endpoints (POST/PUT)         | < 200 ms | < 500 ms | < 1 s    |
| Dashboard / analytics (ClickHouse) | < 500 ms | < 1 s    | < 2 s    |
| AI report generation               | < 2 s    | < 5 s    | < 10 s   |
| Notification delivery (in-app SSE) | < 200 ms | < 500 ms | < 1 s    |

### Kafka Consumer Lag SLO

- Normal operations: consumer lag < 1,000 messages per partition
- Alert threshold: lag > 5,000 messages for > 2 minutes
- Critical: lag > 50,000 messages (potential data processing outage)

### Frontend Web Vitals SLO

The API SLOs above cover the backend; user-perceived web performance is governed by **Google Core Web
Vitals**, measured from real users (RUM) at the **p75** percentile (Google's standard).

| Metric | Target (p75, "good") |
| ------ | -------------------- |
| **LCP** — Largest Contentful Paint | ≤ 2.5 s |
| **INP** — Interaction to Next Paint | ≤ 200 ms |
| **CLS** — Cumulative Layout Shift | ≤ 0.1 |

- **RUM collection:** the `web-vitals` library reports LCP/INP/CLS to the telemetry pipeline (OTel →
  the metrics store); tracked per route and per device class.
- **Field-worker reality:** report CWV segmented by a low-end-device + slow-network cohort — the field
  UX (`20 §20.1`) runs on mid/low-end phones over poor connectivity, so the p75 must hold there, not
  only on fast devices.
- **Mobile app** (React Native): track cold-start time + interaction responsiveness analogously.
- **Regression gate:** lab CWV + bundle-size budget are enforced pre-merge (`30 §30.9`).

### SLO Monthly Review

A monthly review of SLO compliance is required for all tiers. The review covers:

- API availability vs. target for the month (error budget consumed vs. remaining)
- Latency SLO compliance per endpoint category
- **Web Vitals (LCP/INP/CLS) p75 vs. target**, including the low-end-device/slow-network cohort
- Kafka consumer lag incidents and duration
- Any SLO burn-rate alerts that fired during the month

**Process:**

1. Engineering Lead pulls the SLO Burn Rate Dashboard for the preceding calendar month
2. Documents compliance status, incidents, and corrective actions
3. Saves notes to `docs/slo/monthly-reviews/YYYY-MM.md` (one file per month)
4. Reviews with product owner; escalates if error budget < 20% remaining

**Cadence:** First business day of each month, covering the previous month.

**File location:** `docs/slo/monthly-reviews/YYYY-MM.md`

---

## 31.7 Alerting Rules

Alerts are routed via **Alertmanager** (bundled with Prometheus) to the on-call channel.

### Critical Alerts (Page immediately)

| Alert                               | Condition                                                      | Action                                         |
| ----------------------------------- | -------------------------------------------------------------- | ---------------------------------------------- |
| Service down                        | Pod not ready for > 2 minutes                                  | Page on-call; check pod logs                   |
| DB connection exhausted             | PostgreSQL connection pool > 95%                               | Page on-call; scale connection pool or service |
| Kafka consumer lag critical         | Lag > 50,000 on any topic                                      | Page on-call; check consumer health            |
| Safety notification delivery failed | `notification_pending_total{notification_type="safety"} > 0`   | Page on-call; check Notification Service       |
| Tenant isolation breach (test)      | `tenant_isolation_check_result == 0` (synthetic probe — §30.6) | Page security lead immediately                 |

### Warning Alerts (Slack notification)

| Alert                      | Condition                                       |
| -------------------------- | ----------------------------------------------- |
| High latency               | p95 API latency > 1 s for > 5 minutes           |
| High error rate            | HTTP 5xx rate > 1% for > 5 minutes              |
| Kafka consumer lag warning | Lag > 5,000 on any topic for > 2 minutes        |
| AI token budget near limit | Tenant token consumption > 80% of monthly quota |
| Disk usage high            | Any PV > 80% full                               |
| Memory pressure            | Pod memory > 85% of limit for > 10 minutes      |

### Escalation Policy

1. Alert fires → on-call engineer receives PagerDuty notification
2. No acknowledgement in 5 minutes → escalate to Engineering Lead
3. No acknowledgement in 15 minutes → escalate to CTO

---

## 31.8 Dashboards

All dashboards are version-controlled as Grafana JSON in the GitOps repository.
Dashboard IDs and their corresponding SLO targets are registered in `docs/slo/dashboard-registry.md`.

### Platform Overview Dashboard

- Service health matrix (all pods green/yellow/red)
- Request rate and error rate per service
- Active tenants and request distribution
- Kafka consumer lag summary

### Tenant Operations Dashboard (per tenant)

- API request volume and latency — `http_requests_total`, `http_request_duration_seconds` (Prometheus)
- Active users and concurrent sessions — `active_sessions_total{tenant_id}` (Identity Service gauge)
- Storage usage (PostgreSQL, S3) — `storage_used_bytes{tenant_id, storage_type}` (backend telemetry gauge)
- AI token consumption this month vs. quota — `llm_tokens_consumed_total{tenant_id}` (Prometheus)

### Business Metrics Dashboard (internal)

- Daily active tenants — `COUNT(DISTINCT tenant_id) FROM audit_logs WHERE created_at >= today()`
  (PostgreSQL via Grafana PostgreSQL data source)
- Total procurement value processed (THB) — `SUM(total_amount) FROM purchase_orders WHERE status = 'APPROVED'`
  (PostgreSQL via Grafana PostgreSQL data source)
- Total site reports submitted — `sumMerge(report_count) FROM analytics.site_activity_daily`
  (ClickHouse via Grafana ClickHouse data source)
- Approval workflow completion rate and average time — `workflow_completed_total`,
  `workflow_started_total` (Prometheus)

### SLO Burn Rate Dashboard

- Error budget remaining per tier (30-day rolling window)
- Burn rate alerts: fast burn (1-hour window) and slow burn (6-hour window)
- Historical SLO compliance chart

### Implementation Dashboards (Engineering — Phase 15)

These dashboards are organized by technology component. They complement the four
audience-based dashboards above and are required deliverables of Phase 15.

| Dashboard | Panels |
| --------- | ------ |
| Per-Service Overview | HTTP throughput (req/s), error rate (%), latency P50/P95/P99 |
| Kafka | Consumer lag per group, DLQ depth, messages produced/consumed (per/s) |
| Database | DB query duration P50/P95, slow query count (P95 > 1s), PgBouncer pool |
| AI & LLM | Token usage per tenant/model, AI latency P50/P95, AI error rate |
| Infrastructure (Kubernetes) | CPU/memory per pod, disk I/O per node, pod restarts (last 1h) |

All dashboards are version-controlled as Grafana JSON and provisioned automatically via the
Grafana provisioning config (GitOps).

---

## 31.9 On-call & Incident Response

### Incident Severity Classification

> **Severity scheme:** P0–P3 (P0 is the most severe).

| Severity      | Definition                                | Response Time     | Example                                                            |
| ------------- | ----------------------------------------- | ----------------- | ------------------------------------------------------------------ |
| P0 — Critical | Complete service outage or data loss risk | 15 minutes        | All API endpoints returning 5xx; DB unresponsive                   |
| P1 — High     | Partial outage affecting a key user flow  | 30 minutes        | Procurement approval workflow failing; notifications not delivered |
| P2 — Medium   | Degraded performance, workaround exists   | 2 hours           | Dashboard slow (> 5 s p95); AI generation timing out               |
| P3 — Low      | Minor issue, no user impact               | Next business day | Monitoring alert misconfigured; log noise                          |

### Incident Runbooks

Operational runbooks for on-call response live in `docs/runbooks/`:

| Scenario                                     | Runbook                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| Service deployment / rollout                 | [deployment.md](../runbooks/deployment.md)                               |
| Service rollback                             | [rollback.md](../runbooks/rollback.md)                                   |
| P1/P2 incident management                    | [incident-response.md](../runbooks/incident-response.md)                 |
| Full disaster recovery                       | [disaster-recovery/](../runbooks/disaster-recovery/)                     |
| Production readiness gate                    | [production-readiness.md](../runbooks/production-readiness.md)           |
| AI feature activation                        | [ai-readiness-checklist.md](../runbooks/ai-readiness-checklist.md)       |
| DB failover (PostgreSQL RDS Multi-AZ)        | [db-failover.md](../runbooks/db-failover.md)                             |
| Kafka consumer lag & partition rebalance     | [kafka-partition-rebalance.md](../runbooks/kafka-partition-rebalance.md) |
| Keycloak realm recovery                      | [keycloak-realm-recovery.md](../runbooks/keycloak-realm-recovery.md)     |
| Keycloak realm daily backup (CronJob spec)   | [keycloak-realm-backup.md](../runbooks/keycloak-realm-backup.md)         |
| Temporal.io worker restart & stuck workflows | [temporal-worker-restart.md](../runbooks/temporal-worker-restart.md)     |

### Post-incident Review

- P1 and P2 incidents require a written post-mortem within 48 hours
- Post-mortem template: timeline, root cause, impact, remediation, prevention
- Post-mortems are blameless — focus on system improvement, not individual fault
- Action items tracked in the engineering backlog with severity label

---

## 31.10 Synthetic Monitoring

Health-check probes run every 60 seconds from ≥ 2 AWS regions against all public
endpoints, independently of the CI/CD pipeline. This provides continuous assurance
that the platform is reachable and behaving correctly in production.

| Property       | Value                                                                      |
| -------------- | -------------------------------------------------------------------------- |
| Interval       | 60 seconds                                                                 |
| Regions        | ≥ 2 AWS regions (primary + at least one secondary)                         |
| Implementation | OpenTelemetry Collector + Grafana Synthetic Monitoring                     |
| Probe location | `infrastructure/synthetics/`                                               |
| Alerts         | Probe failure fires `ServiceDown` alert (§31.7) after 2 consecutive misses |

Probe definitions (HTTP, DNS, SSL certificate expiry) live in `infrastructure/synthetics/`
and are version-controlled. A new public endpoint must have a corresponding probe committed
in the same PR that introduces the endpoint.

> **Relationship to tenant isolation probe:** The synthetic probes in `infrastructure/synthetics/`
> cover availability and correctness of public endpoints. The tenant isolation CronJob in
> `infrastructure/monitoring/isolation-probe/` covers security — these are separate concerns
> and both are required.

---

## 31.11 Resilience Validation (Chaos & Game-day)

SLOs (§31.6) and DR targets ([08-enterprise-deployment §8.2](08-enterprise-deployment.md)) are only
credible if failure is exercised, not just documented.

- **Quarterly DR game-day** — execute a real failover + restore using the `docs/runbooks/disaster-recovery/`
  runbook; **measure actual RTO/RPO against the 08 §8.2 targets** for the highest tier served; file
  findings in `docs/runbooks/gameday-<date>.md`.
- **Monthly dependency-failure injection** — kill or latency-inject one critical dependency
  (PostgreSQL, Redis, Kafka, EMQX, a third-party mobile lib) in staging; assert graceful degradation
  and no data loss.
- **Steady-state hypothesis** — before each experiment, define the metric that proves "normal", the
  blast-radius limit, and the rollback (Principles of Chaos Engineering).
- **Gate** — a tier cannot be marked production-ready until it has passed ≥ 1 game-day at its
  RTO/RPO.

## 31.12 Delivery Metrics (DORA)

Delivery health is measured from CI/CD and reviewed monthly alongside SLOs (§31.6.4). Target band =
DORA "High → Elite" (State of DevOps 2024, which adds a 5th key, rework/failure-recovery rate).

| DORA key | Target |
| -------- | ------ |
| Deployment frequency | On-demand (≥ daily for shared services) |
| Change lead time | < 1 day (commit → prod) |
| Change failure rate | < 15% (aim ~5%) |
| Failed-deployment recovery | < 1 hour (aligns with P0/P1 response, §31.9) |
| Rework rate (2024 5th key) | Trending down QoQ |

No manual deploy paths; feature flags are the default mechanism for risky rollouts. DORA metrics
are emitted to the SLO Burn Rate dashboard family (§31.8).

---

## References

| ID              | Title                                                              | Source                                                                        |
| --------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| [DORA]          | DORA State of DevOps / Four Keys                                   | [dora.dev](https://dora.dev/)                                                 |
| [Chaos]         | Principles of Chaos Engineering                                    | [principlesofchaos.org](https://principlesofchaos.org/)                       |
| [IEEE 830]      | IEEE Recommended Practice for Software Requirements Specifications | IEEE Std 830-1998                                                             |
| [OpenTelemetry] | OpenTelemetry Specification                                        | [opentelemetry.io/docs/specs/otel](https://opentelemetry.io/docs/specs/otel/) |
| [Prometheus]    | Prometheus Monitoring Documentation                                | [prometheus.io/docs](https://prometheus.io/docs/introduction/overview/)       |
| [Grafana]       | Grafana Observability Platform Documentation                       | [grafana.com/docs/grafana/latest](https://grafana.com/docs/grafana/latest/)   |
| [Loki]          | Grafana Loki Log Aggregation Documentation                         | [grafana.com/docs/loki/latest](https://grafana.com/docs/loki/latest/)         |
| [Jaeger]        | Jaeger Distributed Tracing Documentation                           | [jaegertracing.io/docs/latest](https://www.jaegertracing.io/docs/latest/)     |
| [SRE-Book]      | Site Reliability Engineering: How Google Runs Production Systems   | Beyer et al., O'Reilly 2016                                                   |
| [PagerDuty]     | PagerDuty Incident Response Documentation                          | [response.pagerduty.com](https://response.pagerduty.com/)                     |

---

> 📎 See also: [04-tech-stack](04-tech-stack.md) · [05-security-compliance](05-security-compliance.md) · [08-enterprise-deployment](08-enterprise-deployment.md) · [15-event-driven-workflow](15-event-driven-workflow.md) · [19-notification-architecture](19-notification-architecture.md) · [30-testing-strategy](30-testing-strategy.md)
