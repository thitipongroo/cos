---
title: 'Monitoring & Observability'
version: '1.7.0'
status: Active
last_updated: '2026-05-28'
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

| Metric                              | Type      | Labels                                              |
| ----------------------------------- | --------- | --------------------------------------------------- |
| `http_request_duration_seconds`     | Histogram | service, endpoint, method, status_code, tenant_tier |
| `http_requests_total`               | Counter   | service, endpoint, method, status_code              |
| `db_query_duration_seconds`         | Histogram | service, query_type                                 |
| `kafka_messages_produced_total`     | Counter   | service, topic                                      |
| `kafka_messages_consumed_total`     | Counter   | service, topic, consumer_group                      |
| `workflow_started_total`            | Counter   | workflow_type                                       |
| `workflow_completed_total`          | Counter   | workflow_type, outcome (success/failed/timeout)     |
| `approval_pending_duration_seconds` | Histogram | workflow_type                                       |

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

---

## 31.7 Alerting Rules

Alerts are routed via **Alertmanager** (bundled with Prometheus) to the on-call channel.

### Critical Alerts (Page immediately)

| Alert                               | Condition                                                   | Action                                         |
| ----------------------------------- | ----------------------------------------------------------- | ---------------------------------------------- |
| Service down                        | Pod not ready for > 2 minutes                               | Page on-call; check pod logs                   |
| DB connection exhausted             | PostgreSQL connection pool > 95%                            | Page on-call; scale connection pool or service |
| Kafka consumer lag critical         | Lag > 50,000 on any topic                                   | Page on-call; check consumer health            |
| Safety notification delivery failed | `safety.incident.reported` event not delivered within 5 min | Page on-call; check Notification Service       |
| Tenant isolation breach (test)      | Any cross-tenant isolation test fails in prod health check  | Page security lead immediately                 |

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

### Platform Overview Dashboard

- Service health matrix (all pods green/yellow/red)
- Request rate and error rate per service
- Active tenants and request distribution
- Kafka consumer lag summary

### Tenant Operations Dashboard (per tenant)

- API request volume and latency
- Active users and concurrent sessions
- Storage usage (PostgreSQL, S3)
- AI token consumption this month vs. quota

### Business Metrics Dashboard (internal)

- Daily active tenants
- Total procurement value processed (THB)
- Total site reports submitted
- Approval workflow completion rate and average time

### SLO Burn Rate Dashboard

- Error budget remaining per tier (30-day rolling window)
- Burn rate alerts: fast burn (1-hour window) and slow burn (6-hour window)
- Historical SLO compliance chart

---

## 31.9 On-call & Incident Response

### Incident Severity Classification

| Severity      | Definition                                | Response Time     | Example                                                            |
| ------------- | ----------------------------------------- | ----------------- | ------------------------------------------------------------------ |
| P1 — Critical | Complete service outage or data loss risk | 15 minutes        | All API endpoints returning 5xx; DB unresponsive                   |
| P2 — High     | Partial outage affecting a key user flow  | 30 minutes        | Procurement approval workflow failing; notifications not delivered |
| P3 — Medium   | Degraded performance, workaround exists   | 2 hours           | Dashboard slow (> 5 s p95); AI generation timing out               |
| P4 — Low      | Minor issue, no user impact               | Next business day | Monitoring alert misconfigured; log noise                          |

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

## References

| ID              | Title                                                              | Source                                                                        |
| --------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
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
