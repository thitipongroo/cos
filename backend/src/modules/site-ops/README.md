# site-ops

NestJS module for site operations: daily reports, issues, inspections, and offline sync.

## Purpose

Captures structured operational data from construction sites (Phase 6). Implements the three offline conflict resolution strategies, the `ConflictHandler` class, and the `POST /api/v1/sync/resolve` server-side sync endpoint. Optimised for low-bandwidth mobile-first usage.

**Status:** Module scaffolded. Full implementation in Phase 6.

## Public API

```
POST  /api/v1/site-reports            — create or sync offline report
GET   /api/v1/site-reports            — list (paginated, date range filter)
GET   /api/v1/site-reports/:id        — get detail
POST  /api/v1/site-reports/sync       — bulk sync (accepts array of offline changes)
POST  /api/v1/sync/resolve            — single-entity conflict resolution endpoint
POST  /api/v1/issues                  — create or sync offline issue
PATCH /api/v1/issues/:id              — update issue
GET   /api/v1/issues                  — list (filter by severity, status)
POST  /api/v1/inspections             — submit inspection result
GET   /api/v1/conflict-records        — list unresolved conflicts (SITE_ENGINEER)
PATCH /api/v1/conflict-records/:id/resolve — manual resolution
```

## Conflict Resolution Strategies

| Entity              | Strategy                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `site_reports`      | LAST_WRITE_WINS on `client_submitted_at`                                                    |
| `issues`            | FIELD_LEVEL_MERGE (description/resolution: last-writer; status: server-wins; photos: union) |
| `safety_checklists` | SERVER_WINS — always reject client version                                                  |
| Financial entities  | NO_AUTO_RESOLUTION — held for FINANCE / PROJECT_MANAGER review                              |

Sync wire protocol:

```
POST /api/v1/sync/resolve
{ entity_type, entity_id, client_version, payload, client_submitted_at }
→ { resolved_payload, conflict_status, server_version }
conflict_status ∈ { ACCEPTED | CONFLICT_FLAGGED | CONFLICT_REJECTED }
```

## Dependencies

- `@cos/database` — `TenantPrismaService`
- `@cos/rbac` — `SITE_WORKER`, `SITE_ENGINEER`, `PROJECT_MANAGER` guards
- `@cos/shared` — Kafka event contracts
- `@cos/logger`, `@cos/tracing`
- OpenSearch — full-text search on reports and issues
- File Service API — photo upload (HTTP call to `services/file-service/`)

## Configuration

| Variable           | Description                      |
| ------------------ | -------------------------------- |
| `DATABASE_URL`     | PgBouncer connection string      |
| `KAFKA_BROKERS`    | Kafka broker list                |
| `FILE_SERVICE_URL` | Internal URL of the file service |
| `OPENSEARCH_URL`   | OpenSearch endpoint              |

## Usage

```typescript
// Offline bulk sync
POST /api/v1/site-reports/sync
[
  { entity_type: "site_report", entity_id: "uuid", client_version: 1,
    payload: { ... }, client_submitted_at: "2026-06-01T08:00:00Z" }
]
```

Kafka events emitted: `site.report.created.v1`, `site.report.submitted`, `site.material.consumed.v1`, `site.inspection.failed.v1`, `issue.created`, `issue.status_changed`

## Notes

- Response DTOs accept `?minimal=true` query param for reduced mobile payload
- Extension point: EP-ENV-001 `CarbonCalculationEngine` — consumes `site.material.consumed` events
