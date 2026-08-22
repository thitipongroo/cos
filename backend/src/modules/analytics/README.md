# analytics

NestJS module serving the executive, PM and per-project trend dashboards from ClickHouse.

## Purpose

Read-only analytics API backed by ClickHouse aggregate tables with a Redis response cache (Phase 14).
Aggregation happens at ingestion time in materialized views — never at query time — so the dashboard
latency SLO is met. Source: `00_master` §Phase 14; SLO `31-monitoring-observability` §31.6.

## Public API

```text
GET /api/v1/analytics/executive                              — executive dashboard
GET /api/v1/analytics/pm/:projectId                          — PM dashboard
GET /api/v1/analytics/projects/:projectId/cost-trend         — cost trend
GET /api/v1/analytics/projects/:projectId/procurement-trend  — procurement trend
GET /api/v1/analytics/projects/:projectId/site-trend         — site activity trend
```

## Dependencies

- ClickHouse (`@clickhouse/client`) — `project_cost_daily`, `procurement_activity_daily`,
  `site_activity_daily`
- Redis — response cache, key format `analytics:{tenant_id}:{dashboard_type}:{project_id}:{date_range}`
- `JwtAuthGuard` + tenant context (CLS) — every query is tenant-scoped

Both the ClickHouse client and the cache Redis client are created in the module factory and closed
from the module class's `onModuleDestroy` (ADR-034 / Rule 39).

## Configuration

| Variable                | Description                                  |
| ----------------------- | -------------------------------------------- |
| `CLICKHOUSE_URL`        | ClickHouse HTTP endpoint                     |
| `CLICKHOUSE_USER`       | ClickHouse user                              |
| `CLICKHOUSE_PASSWORD`   | ClickHouse password                          |
| `CLICKHOUSE_DB`         | ClickHouse database name                     |
| `REDIS_URL`             | Redis connection string (response cache)     |

DI tokens: `CLICKHOUSE_CLIENT`, `ANALYTICS_CACHE_REDIS` (see `analytics.tokens.ts`).

## Usage

```text
GET /api/v1/analytics/executive?projectIds[]=<uuid>&dateRange=2026-01-01,2026-06-30
GET /api/v1/analytics/pm/<projectId>?dateRange=2026-06-01,2026-06-30
```

Cache is invalidated event-driven: a relevant Kafka event clears the matching cache key.

## Notes

- Request validation lives in `analytics.request.ts` (class-validator) — malformed `dateRange` or
  `projectIds` return 400 with field-level detail.
- Dashboard/analytics latency SLO: p95 < 1 s (`31-monitoring-observability` §31.6, QM-6).
- Test design: `docs/specifications/35-test-design.md` §35.10.14.
