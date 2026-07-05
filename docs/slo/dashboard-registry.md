# Construction OS — Grafana Dashboard Registry

> **Purpose:** Register all Grafana dashboards by UID/ID per SLO. Required by QM-14.
> SLO burn rate alerts (QM-8) reference dashboards by UID for alert annotations.
> Update this file whenever a new dashboard is added or an existing one is renamed/replaced.

---

## How to add a dashboard

1. Create the dashboard in Grafana (staging or production)
2. Copy the UID from the dashboard URL: `https://grafana.internal/d/{UID}/dashboard-name`
3. Add a row to the relevant table below
4. Commit this file — CI verifies that all referenced UIDs exist in the provisioned dashboard JSON

---

## SLO dashboards

These dashboards are the authoritative source for SLO compliance per QM-14.

| Dashboard Name                                        | Grafana UID            | Grafana ID | SLO(s) Covered                                    | Environment       | Status  |
| ----------------------------------------------------- | ---------------------- | ---------- | ------------------------------------------------- | ----------------- | ------- |
| API Availability — SMB (99.5% SLO)                    | `cos-avail-smb`        | TBD        | API availability 99.5% (Shared SaaS — SMB)        | Production        | PENDING |
| API Availability — Mid-market (99.9% SLO)             | `cos-avail-mid`        | TBD        | API availability 99.9% (Shared SaaS — Mid-market) | Production        | PENDING |
| API Availability — Enterprise (99.95% SLO)            | `cos-avail-ent`        | TBD        | API availability 99.95% (Dedicated)               | Production        | PENDING |
| API Latency SLO (read p95 < 300ms, write p95 < 500ms) | `cos-latency-slo`      | TBD        | p95 read latency; p95 write latency               | Production        | PENDING |
| 5xx Error Rate SLO (< 0.1%)                           | `cos-error-rate-slo`   | TBD        | 5xx error rate SLO                                | Production        | PENDING |
| Analytics / ClickHouse SLO (p95 < 1s)                 | `cos-analytics-slo`    | TBD        | p95 dashboard/analytics latency                   | Production        | PENDING |
| AI Report Generation SLO (p95 < 5s)                   | `cos-ai-slo`           | TBD        | p95 AI report generation latency                  | Production        | PENDING |
| Notification Delivery SLO (p95 < 500ms)               | `cos-notification-slo` | TBD        | p95 in-app SSE notification delivery              | Production        | PENDING |
| Mobile Offline Sync SLO (< 30s for 5MB)               | `cos-mobile-sync-slo`  | TBD        | Mobile offline sync latency                       | Staging (sampled) | PENDING |
| Kafka Consumer Lag SLO                                | `cos-kafka-lag-slo`    | TBD        | Kafka consumer lag < 1,000 msgs/partition         | Production        | PENDING |

---

## Operational dashboards

These dashboards support on-call and incident response. Not SLO-bound but required before Stage 2.

| Dashboard Name                                    | Grafana UID           | Purpose                                                                            | Environment          | Status  |
| ------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------- | -------------------- | ------- |
| COS Overview — Platform Health                    | `cos-platform-health` | Single-pane health for all services                                                | Production + Staging | PENDING |
| NestJS Backend — Request Rate / Errors / Duration | `cos-backend-red`     | RED metrics per NestJS module                                                      | Production           | PENDING |
| PgBouncer — Connection Pool                       | `cos-pgbouncer`       | `client_active`, `server_active`, `client_waiting` (alert threshold: > 10 waiting) | Production           | PENDING |
| PostgreSQL — Query Performance                    | `cos-postgres-perf`   | Slow query p95/p99; active connections; replication lag                            | Production           | PENDING |
| ClickHouse — Analytics Query Performance          | `cos-clickhouse`      | Query latency; insert throughput; merge queue                                      | Production           | PENDING |
| Kafka — Broker and Consumer Group Health          | `cos-kafka-health`    | Broker health; consumer group lag per topic                                        | Production           | PENDING |
| Temporal — Workflow Health                        | `cos-temporal`        | Workflow started/completed/failed counts; task queue latency                       | Production           | PENDING |
| AI Gateway — LLM Metrics                          | `cos-ai-gateway`      | Token usage; LLM latency p95; hallucination guard rejections                       | Production           | PENDING |
| Kong Gateway — API Traffic                        | `cos-kong`            | Request rate; 4xx/5xx; rate limit hits per route                                   | Production           | PENDING |
| Mobile Sync — Conflict and Queue Health           | `cos-mobile-sync`     | Sync queue depth; conflict rate per entity type                                    | Production           | PENDING |
| SLO Error Budget Burn Rate                        | `cos-error-budget`    | Burn rate 1h and 6h per SLO; budget remaining %                                    | Production           | PENDING |

---

## Alertmanager annotations

Alertmanager alert rules in `infrastructure/monitoring/alertmanager/` reference dashboards via
the `grafana_dashboard_uid` annotation field. Format:

```yaml
annotations:
  grafana_dashboard_uid: cos-latency-slo
  grafana_panel_id: '12'
  runbook_url: https://docs.construction-os.internal/runbooks/incident-response
```

---

## Status legend

| Status        | Meaning                                                                                                                |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `PENDING`     | Dashboard not yet created in Grafana; UID is a placeholder                                                             |
| `PROVISIONED` | Dashboard JSON committed to `infrastructure/monitoring/grafana/dashboards/`; auto-provisioned via Grafana provisioning |
| `LIVE`        | Dashboard verified working in production with real data                                                                |

---

## Provisioning

All dashboards must be provisioned as code via Grafana dashboard provisioning
(`infrastructure/monitoring/grafana/dashboards/*.json`), not created manually in the UI.

Grafana provisioning config: `infrastructure/monitoring/grafana/provisioning/dashboards/cos-dashboards.yaml`.

Before Stage 1 → Stage 2:

- [ ] All SLO dashboards: `PROVISIONED` (JSON committed)
- [ ] All SLO dashboards: `LIVE` (verified against real staging metrics)
- [ ] UID column fully populated (no TBD remaining)
