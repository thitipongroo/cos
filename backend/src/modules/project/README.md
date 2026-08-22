# project

NestJS module for project lifecycle management.

## Purpose

Manages construction projects with a strict state machine (Phase 3).
Enforces RBAC-controlled state transitions, project membership, and document associations.
Emits Kafka events on all state changes for downstream consumers (Finance, Analytics, KG).

## Public API

```text
POST   /api/v1/projects                          — create project (DRAFT)
GET    /api/v1/projects                          — list (paginated, filter by status/type)
GET    /api/v1/projects/:id                      — get detail
PATCH  /api/v1/projects/:id                      — update metadata (not status)
POST   /api/v1/projects/:id/transitions          — trigger status transition { to, reason? }
POST   /api/v1/projects/:id/members              — add member
DELETE /api/v1/projects/:id/members/:userId      — remove member
GET    /api/v1/projects/:id/members              — list members
GET    /api/v1/projects/:id/documents            — list documents
```

## State Machine

```text
DRAFT → ACTIVE → ON_HOLD → ACTIVE (resume)
ACTIVE → COMPLETED  (TENANT_ADMIN only; end_date ≤ today required)
ANY    → CANCELLED  (TENANT_ADMIN only; terminal state)
```

## Dependencies

- `@cos/database` — `TenantPrismaService`, pagination utilities
- `@cos/rbac` — `PROJECT_MANAGER`, `TENANT_ADMIN` role guards
- `@cos/shared` — Kafka event types and `KafkaProducer`
- `@cos/logger`, `@cos/tracing` — observability
- OpenSearch — full-text search on `project_name`, `project_code`. READ only: this module queries
  the index, it no longer writes to it. `SearchIndexerConsumer` (`modules/search`) keeps
  `cos_projects` current off the `construction.project.*` events published here, so a failed index
  write is retried and then lands in the DLQ instead of being logged and lost (TDD OQ-22).

## Configuration

| Variable         | Description                 |
| ---------------- | --------------------------- |
| `DATABASE_URL`   | PgBouncer connection string |
| `KAFKA_BROKERS`  | Kafka broker list           |
| `OPENSEARCH_URL` | OpenSearch endpoint         |

## Usage

```typescript
// Trigger a state transition
POST /api/v1/projects/uuid/transitions
{ "to": "ACTIVE" }

// Add a member
POST /api/v1/projects/uuid/members
{ "userId": "uuid", "role": "SITE_ENGINEER" }
```

Kafka events emitted:

- `construction.project.created.v1`
- `project.updated`
- `project.status_changed`
- `project.archived`

## Notes

- `CANCELLED` is a terminal state — no further transitions
- `ON_HOLD` requires `on_hold_reason` in request body
- Pagination uses cursor-based strategy (preferred over offset)
- Full-text search via OpenSearch on `project_name` and `project_code`. The index is updated
  asynchronously by `modules/search`, so a document appears shortly after the write commits rather
  than during it; `searchProjects` falls back to the paged database list when the index cannot
  answer.
