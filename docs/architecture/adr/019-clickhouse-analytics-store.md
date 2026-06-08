# ClickHouse as Analytics and Time-Series Store

**Date:** 2026-06-09
**Status:** Accepted
**Deciders:** Product Owner, Engineering Lead
**Tags:** data, architecture

---

## Context

Construction OS analytics requirements:

- **Real-time dashboards** — site progress, budget burn, equipment utilization, inspection pass rates; updated from Kafka event streams within seconds
- **BOQ variance reports** — aggregations over thousands of line items per project
- **API usage metering** — per-tenant request counts, latency percentiles (p50/p95/p99), token usage for AI features
- **SLA monitoring** — time-series data for Grafana dashboards; must support queries like `SELECT p99(latency) WHERE tenant_id=X OVER 24h`

PostgreSQL (existing operational DB) is inappropriate for OLAP workloads — analytical queries scanning millions of rows would contend with OLTP transactions and degrade API latency.

---

## Decision

Use **ClickHouse** as the dedicated analytics and time-series store.

- **Deployment:** Docker container (`infrastructure/clickhouse/`)
- **Ingestion:** Kafka → ClickHouse Kafka Engine → Materialized Views pipeline
- **Schema:** Columnar tables per domain (site events, procurement events, finance events, API metrics)
- **Retention:** 90 days hot (ClickHouse local), 365 days cold (S3 / MinIO object store via ClickHouse S3 integration)
- **Access:** Read-only HTTP endpoint consumed by NestJS analytics module and Grafana
- **Multi-tenancy:** `tenant_id` column in every table; application-level filtering (no RLS needed — analytics is read-only and tenant-scoped at query level)

---

## Rationale

**Why ClickHouse over alternatives?**

| Option | Rejected reason |
|--------|----------------|
| PostgreSQL OLAP | Row-store; aggregation on large tables degrades OLTP latency |
| TimescaleDB | Better for pure time-series, not columnar OLAP; smaller ecosystem |
| BigQuery / Redshift | Cloud-only; per-query cost; no local dev parity |
| Elasticsearch | Full-text search primary use case; aggregations expensive; not columnar |

ClickHouse provides: Kafka Engine for direct stream ingestion, columnar compression (10–50x vs row-store), materialized views for real-time aggregations, open-source, and self-hosted.

---

## Consequences

### Positive
- Analytical queries isolated from PostgreSQL OLTP path
- Kafka Engine enables sub-second dashboard refresh
- p99 latency queries (API metering) execute in <100ms at projected data volumes

### Negative
- Eventual consistency: ClickHouse lags Kafka by up to ~1s under normal load
- Joins across ClickHouse and PostgreSQL require application-layer composition (no foreign keys)

### Neutral
- ClickHouse does not replace PostgreSQL — operational data stays in PostgreSQL

---

## References

- `context/00_master_construction_os.md` §Phase 13 — Analytics & Reporting
- `backend/src/modules/analytics/`
- `infrastructure/clickhouse/`
- `analytics/`
