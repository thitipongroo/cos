---
title: 'ADR-005 — ClickHouse for OLAP Analytics'
status: Accepted
last_updated: '2026-05-29'
authors:
  - thitipongroo
---

# ADR-005 — ClickHouse for OLAP Analytics

**Status:** Accepted
**Date:** 2026-01-20
**Deciders:** Engineering team

## Context

Construction OS generates high-volume operational data that needs executive-level
analytics (dashboard SLA: P95 < 3s for 100 concurrent users):

- Project cost variance trends
- Procurement spend analysis
- Manpower utilization aggregations
- Inspection failure rates

Options considered:

1. PostgreSQL with materialized views (operational DB doing analytics)
2. **ClickHouse** (columnar OLAP, self-hosted)
3. BigQuery (Google Cloud — excluded by cloud choice)
4. Snowflake (excluded — not in AWS stack)
5. AWS Redshift

## Decision

**ClickHouse 24.x** — self-hosted on Kubernetes.

## Rationale

- Columnar storage: 10–100x faster than PostgreSQL for aggregation queries on large datasets
- P95 < 3s for executive dashboard achievable with ClickHouse even at scale
- No per-query cost — fixed infrastructure cost vs BigQuery/Snowflake per-TB billing
- Kafka connector: direct ingestion from operational Kafka topics without ETL pipeline
- Self-hosted = data residency compliance (no data leaving AWS region)

## Consequences

- Analytics data is **eventually consistent** (Kafka lag = seconds behind operational DB)
- Schema: `MergeTree` engine with `ORDER BY (tenant_id, project_id, event_date)` for fast tenant-scoped queries
- Aggregation: `AggregatingMergeTree` for pre-computed metrics (dashboard refresh every 5 min)
- Analytics Worker (Go) handles ClickHouse ingestion from Kafka

## Explicitly NOT done

- BigQuery, Snowflake — not in AWS stack
- Redshift — higher cost and lower performance than ClickHouse for construction data patterns

---

## Implementation notes

Consolidated from the former ADR-019 (ClickHouse as analytics and time-series store,
2026-06-09) when the duplicate was merged on 2026-07-23:

- **Deployment:** Docker container / Kubernetes — config in `infrastructure/clickhouse/`
- **Ingestion:** Kafka → ClickHouse Kafka Engine → Materialized Views pipeline
- **Retention:** 90 days hot (ClickHouse local) + 365 days cold (S3 / MinIO via ClickHouse
  S3 integration)
- **Access:** read-only HTTP endpoint consumed by `backend/src/modules/analytics/` and Grafana
- **Also serves time-series / API metering:** per-tenant request counts and latency
  percentiles (p50/p95/p99), AI token usage — p99 queries execute in <100ms at projected volume
- **Multi-tenancy:** `tenant_id` column + application-level filtering (analytics is read-only)

---

## Alternatives Considered

| Option                             | Reason Rejected                                                                                                              |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL with materialized views | Operational DB doubles as analytics DB — resource contention; P95 < 3s target unachievable at scale with aggregation queries |
| BigQuery                           | Outside AWS stack; per-TB pricing unpredictable at scale; data residency compliance concerns                                 |
| Snowflake                          | Not in AWS stack; per-query billing; data residency issues                                                                   |
| AWS Redshift                       | Higher infrastructure cost; lower query performance than ClickHouse for construction data aggregation patterns               |

---

## References

- `docs/00-specifications/09-data-architecture.md` — data domains, storage strategy, and OLAP vs OLTP separation rationale
- `docs/00-specifications/31-monitoring-observability.md` §31.7 — ClickHouse consumer lag alert thresholds
- `docs/01-architecture/adr/004-kafka-event-bus.md` — Kafka as the source for ClickHouse Analytics Worker ingestion
