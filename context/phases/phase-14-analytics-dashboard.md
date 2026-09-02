# Phase 14 — Analytics + Dashboard

> Moved out of `context/00_master_construction_os.md` on 2026-09-02, verbatim.
> That file keeps the index row pointing here; `.claude/skills/phase-index/SKILL.md`
> is the map. Depends on Phase 3–7, 8, 13 · SaaS Maturity Stage 3.
>
> Rule 36 applies at the end of this phase and Rule 38 before it starts.

```text
Build Analytics Service and dashboards.

Performance SLA (source of truth: docs/specifications/31-monitoring-observability.md §31.6 + QM-6):
  Executive Dashboard:   P95 < 1 second
  PM Dashboard:          P95 < 1 second
  — Corrected 2026-08-22: the former "Executive 3s / PM 2s" split conflicted with the §31.6 SLO
    (dashboard/analytics p95 < 1s) and with §30.9 (p95 < 1s, ClickHouse query < 200ms).
    §31.6 wins per the authority hierarchy (specs beat context files). See
    docs/architecture/test-design/README.md §35.13 ESC-10.
  Data freshness:        15 minutes (acceptable lag from transaction to dashboard)
  Real-time metrics:     < 30 seconds lag (for critical alerts only)
    MEASURED since 2026-08-29 by `analytics_ingestion_lag_seconds` (histogram, label: event_type),
    observed in services/analytics-worker/internal/metrics/lag.go at the aggregate write — the one
    point every event passes, before the per-type dispatch. Alerts AnalyticsDataStale (>900s) and
    AnalyticsRealtimeLagBreach (>30s) read it; the histogram carries exact bucket boundaries at both
    budgets because histogram_quantile interpolates between them.
    Both numbers were stated here and measured by NOTHING until that date, which is invisible from
    outside: a dashboard answering from hours-old aggregates returns 200 and looks like a quiet site.
    Scope: the metric spans occurred_at → the aggregate write, so it covers produce, broker
    retention, consumer scheduling and backlog. It excludes ClickHouse's post-insert merge, which
    would need an `ingested_at DateTime` column on the three aggregate tables (they carry
    `event_date Date` — day granularity cannot express a 30-second budget). The figure therefore
    reads slightly LOW: a floor on real lag, never a ceiling, which is the safe direction for an
    alert.

ClickHouse Strategy:
  Version: ClickHouse 26.x
  Data ingestion: Kafka → ClickHouse via Kafka engine tables (native integration)
  Materialized views: pre-aggregate metrics at ingestion time
    (NOT query-time aggregation — ensures P95 SLA is met)
  Table engine: AggregatingMergeTree for the daily aggregate tables (the Gold layer). ClickHouse holds
    pre-aggregated metrics only — there is no raw-event "fact" table here. Raw/cold retention lives in the
    S3 + Apache Iceberg Data Lake (Path 2 — Debezium CDC → Kafka Connect S3 Sink; scheduled for Phase 17
    but currently FUTURE/deferred per §9.4 — architected, not yet built),
    which back-feeds ClickHouse cold storage. (ReplacingMergeTree is used only for carbon_records, Phase 24.)
    This is the medallion split: Iceberg lake = Bronze/raw, ClickHouse = Gold/aggregates.
  Partitioning: by toYYYYMM(event_date) for all aggregate tables
  TTL: ClickHouse aggregate tables are indefinite (no TTL). Raw-event retention (2 yr operational, 10 yr
    cold) is provided by PostgreSQL (source of truth, 2 yr rolling) + the Iceberg Data Lake (Path 2 —
    deferred/FUTURE per §9.4), NOT by a ClickHouse raw table. Interim (until the Data Lake lands —
    Phase 17+ per §9.4): raw events persist only for the Kafka retention window, so rebuilding a
    materialized view or backfilling a new metric is limited until then — a new metric aggregates from
    go-live forward, and PostgreSQL remains the authoritative rebuild source via event re-emission.

ClickHouse Tables (analytics schema):
  project_cost_daily (AggregatingMergeTree):
    tenant_id:        UUID
    project_id:       UUID
    event_date:       Date
    committed_amount: AggregateFunction(sum, Decimal(19,4))
    actual_amount:    AggregateFunction(sum, Decimal(19,4))
    budget_amount:    Decimal(19,4)  — from project_budgets snapshot

  procurement_activity_daily (AggregatingMergeTree):
    tenant_id:        UUID
    project_id:       UUID
    event_date:       Date
    po_count:         AggregateFunction(count, UInt32)
    rfq_count:        AggregateFunction(count, UInt32)
    invoice_count:    AggregateFunction(count, UInt32)
    overdue_invoice_count: AggregateFunction(count, UInt32)

  site_activity_daily (AggregatingMergeTree):
    tenant_id:        UUID
    project_id:       UUID
    event_date:       Date
    report_count:     AggregateFunction(count, UInt32)
    issue_open_count: AggregateFunction(sum, Int32)
    inspection_fail_count: AggregateFunction(count, UInt32)
    manpower_total:   AggregateFunction(sum, Int32)

Caching Strategy:
  Layer 1: Redis (TTL 5 minutes) — for dashboard API responses
  Layer 2: ClickHouse materialized views — for aggregation queries
  Cache invalidation: event-driven (on relevant Kafka event, clear Redis cache key)
  Cache key format: analytics:{tenant_id}:{dashboard_type}:{project_id}:{date_range}

Dashboards:
  Executive Dashboard (data from project_cost_daily, procurement_activity_daily):
    - Budget utilization % per project (actual/budget)
    - Projects at risk (variance > 10% from budget — threshold is configurable)
    - Procurement overdue invoices count
    - Active projects count by status

  PM Dashboard (data from site_activity_daily, procurement_activity_daily):
    - Daily manpower trend (last 30 days)
    - Open issues by severity
    - Inspection pass rate
    - RFQ pending count, PO delivery overdue count

APIs (NestJS Analytics Service, backed by ClickHouse + Redis):
  GET /api/v1/analytics/executive?projectIds[]=...&dateRange=...
  GET /api/v1/analytics/pm/:projectId?dateRange=...
  GET /api/v1/analytics/projects/:projectId/cost-trend
  GET /api/v1/analytics/projects/:projectId/procurement-trend
  GET /api/v1/analytics/projects/:projectId/site-trend

Generate:

- ClickHouse Docker Compose service
- Kafka engine table definitions (ClickHouse DDL)
- Materialized view DDL for all aggregation tables
- Analytics NestJS service with ClickHouse client (clickhouse-js)
- Redis cache layer around all analytics queries
- Dashboard API controllers (one per dashboard type)
- Frontend Next.js dashboard components (use Recharts)
- Unit tests: cache logic, aggregation query building
- Integration tests: Kafka → ClickHouse → API flow
- Load tests: verify P95 < 1s SLA under 100 concurrent dashboard loads (§31.6)
- OpenAPI 3.1 spec: docs/api/analytics.openapi.yaml (per spec §14.3 canonical table — Analytics, MVP Phase 14)


Constraints:

- Before marking Phase 14 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```
