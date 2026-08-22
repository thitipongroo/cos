# Site Operations Module — Phase 6

## Purpose

Manages daily field operations: site reports, issue tracking, safety inspections, and offline sync conflict resolution. Primary data-capture module for field workers (SITE_WORKER, SITE_ENGINEER).

## Public API

### Site Reports

| Method | Path                             | Roles                                                     |
| ------ | -------------------------------- | --------------------------------------------------------- |
| `POST` | `/api/v1/site/reports`           | SITE_WORKER, SITE_ENGINEER, PROJECT_MANAGER, TENANT_ADMIN |
| `GET`  | `/api/v1/site/reports`           | All field + management roles                              |
| `GET`  | `/api/v1/site/reports/:reportId` | All field + management roles                              |
| `POST` | `/api/v1/site/reports/sync`      | SITE_WORKER, SITE_ENGINEER, PROJECT_MANAGER, TENANT_ADMIN |

### Issues

| Method  | Path                           | Roles                                                                     |
| ------- | ------------------------------ | ------------------------------------------------------------------------- |
| `POST`  | `/api/v1/site/issues`          | SITE_WORKER, SITE_ENGINEER, PROJECT_MANAGER, TENANT_ADMIN                 |
| `PATCH` | `/api/v1/site/issues/:issueId` | SITE_WORKER, SITE_ENGINEER, PROJECT_MANAGER, SAFETY_OFFICER, TENANT_ADMIN |
| `GET`   | `/api/v1/site/issues`          | All roles                                                                 |

### Inspections

| Method | Path                       | Roles                                       |
| ------ | -------------------------- | ------------------------------------------- |
| `POST` | `/api/v1/site/inspections` | SITE_ENGINEER, SAFETY_OFFICER, TENANT_ADMIN |

### Conflict Records

| Method  | Path                                                | Roles                                        |
| ------- | --------------------------------------------------- | -------------------------------------------- |
| `GET`   | `/api/v1/site/conflict-records`                     | SITE_ENGINEER, PROJECT_MANAGER, TENANT_ADMIN |
| `PATCH` | `/api/v1/site/conflict-records/:conflictId/resolve` | SITE_ENGINEER, PROJECT_MANAGER, TENANT_ADMIN |

## Offline Sync Conflict Strategies (QM-9)

| Entity              | Strategy                                 | Notes                                                                      |
| ------------------- | ---------------------------------------- | -------------------------------------------------------------------------- |
| `site_reports`      | LAST_WRITE_WINS on `client_submitted_at` | Flags CONFLICT when server `modified_at` > `last_known_modified_at`        |
| `issues`            | FIELD_LEVEL_MERGE                        | `status` = server wins; `description`/`resolution_note` = last writer wins |
| `safety_checklists` | SERVER_WINS                              | Client version always rejected; safety data is authoritative               |
| Financial entities  | NO_AUTO_RESOLUTION                       | Held for FINANCE/PROJECT_MANAGER review; never auto-merged                 |

Sync wire protocol:

```text
POST /api/v1/site-reports/sync
{ client_id, project_id, report_date, payload, client_submitted_at, last_known_modified_at }
→ [{ client_id, report_id, conflict_status }]
conflict_status ∈ { ACCEPTED | CONFLICT_FLAGGED | CONFLICT_REJECTED }
```

## Kafka Events Emitted

| Event                          | Trigger                                 |
| ------------------------------ | --------------------------------------- |
| `site.report.created.v1`       | Report created                          |
| `site.report.submitted.v1`     | Report synced from offline              |
| `site.issue.created.v1`        | Issue created                           |
| `site.issue.status_changed.v1` | Issue status transitions                |
| `site.inspection.passed.v1`    | Inspection submitted with PASSED status |
| `site.inspection.failed.v1`    | Inspection submitted with FAILED status |
| `site.material.consumed.v1`    | Material consumption logged             |
| `site.conflict.flagged.v1`     | Offline-sync CONFLICT_FLAGGED persisted |

## Dependencies

- `TenantModule` — `TenantPrismaService` for tenant-isolated DB access (ADR-008: tenant_id + RLS)
- `@cos/kafka` — `KafkaProducer` (SDK)
- `@cos/shared` — typed event payload contracts
- `@cos/logger` — structured logging
- `@cos/rbac` — `@Roles` decorator, `RolesGuard`

## Configuration

| Variable           | Description                                          |
| ------------------ | ---------------------------------------------------- |
| `DATABASE_URL`     | PostgreSQL connection string (via PgBouncer — QM-18) |
| `KAFKA_BROKERS`    | Comma-separated broker list                          |
| `FILE_SERVICE_URL` | Internal URL of the file service (Phase 9)           |

## Extension Points

- `ep/carbon-calculation.stub.ts` — CarbonCalculationEngine (EN 15804 + GHG Protocol); trigger: tenant requests carbon reporting
- `ep/file-service.stub.ts` — Photo upload via File Service (Phase 9)

## Usage Example

```typescript
// Sync offline site reports
// POST /api/v1/site-reports/sync
// Authorization: Bearer <jwt>

{
  "items": [
    {
      "client_id": "550e8400-e29b-41d4-a716-446655440000",
      "project_id": "...",
      "report_date": "2026-06-04",
      "summary": "Foundation work complete",
      "manpower_count": 15,
      "client_submitted_at": "2026-06-04T16:00:00Z",
      "last_known_modified_at": "2026-06-04T08:00:00Z"
    }
  ]
}

// Response:
// [{ "client_id": "...", "report_id": "...", "conflict_status": "ACCEPTED" }]
```

## OpenAPI Spec

`docs/api/site-ops.openapi.yaml`
