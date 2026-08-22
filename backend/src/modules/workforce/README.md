# workforce

NestJS module for workforce management, attendance tracking, and timesheets.

## Purpose

Manages workers, project allocations, attendance check-in/check-out, and timesheet approval (Phase 22).
Attendance logs and timesheets are stored as TimescaleDB hypertables.

**Status:** Implemented. Every endpoint in the Phase 22 command exists, plus `GET /workers/me` and
the project workforce directory.

**Biometric / QR check-in is NOT implemented**, and there is no stub for it. The Phase 22 command
defers it — "do not implement until spec defines it" — and no spec has. This file used to claim a
`BiometricCheckIn` stub under `EP-DOMAIN-008`; that identifier appears nowhere else in the
repository (TDD OQ-37, corrected 2026-08-22).

## Public API

```text
POST /api/v1/workers                               — create worker
GET  /api/v1/workers                               — list workers (tenant-scoped)
GET  /api/v1/workers/:id                           — get detail
POST /api/v1/projects/:projectId/workforce         — allocate worker to project
GET  /api/v1/projects/:projectId/workforce         — list project workforce
POST /api/v1/workers/:id/attendance                — record check-in / check-out
GET  /api/v1/workers/:id/attendance                — attendance history (date range)
POST /api/v1/timesheets                            — submit timesheet
PATCH /api/v1/timesheets/:id/approve               — approve timesheet (SITE_ENGINEER)
GET  /api/v1/projects/:projectId/workforce/summary — manpower summary for analytics
GET  /api/v1/workers/me                            — the signed-in worker's own record
GET  /api/v1/projects/:projectId/workforce/directory — project directory (docs/api/workforce.openapi.yaml)
```

`GET /workers/me` is declared BEFORE `@Get(':id')` so the literal segment is not captured as a UUID.

## Dependencies

- `@cos/database` — `TenantPrismaService`
- `@cos/financial` — `Decimal` for `daily_rate` fields
- `@cos/rbac` — `SITE_ENGINEER`, `PROJECT_MANAGER` guards
- `@cos/shared` — Kafka event contracts
- TimescaleDB — hypertables for `attendance_logs` and `timesheets`

## Configuration

| Variable        | Description                                            |
| --------------- | ------------------------------------------------------ |
| `DATABASE_URL`  | PgBouncer connection string (PostgreSQL + TimescaleDB) |
| `KAFKA_BROKERS` | Kafka broker list                                      |

## Usage

```typescript
// Record attendance check-in
POST /api/v1/workers/uuid/attendance
{ "project_id": "uuid", "check_in_at": "2026-06-01T07:30:00Z" }

// Record check-out — the SAME endpoint. Check-in and check-out are distinguished by which
// timestamp the body carries, not by separate routes; there is no PATCH .../attendance/latest.
POST /api/v1/workers/uuid/attendance
{ "project_id": "uuid", "check_out_at": "2026-06-01T17:00:00Z" }
```

Kafka events emitted: `workforce.checkin.created.v1`, `workforce.checkout.created.v1`, `workforce.timesheet.approved.v1`

## Notes

- `attendance_logs` hypertable: chunk interval = 1 week; chunk compression after 30 days
- `timesheets` hypertable: partitioned by `period_date` (monthly)
- Employment types: PERMANENT, CONTRACT, SUBCONTRACT
- Biometric / QR check-in: deferred by the Phase 22 command; not implemented and not stubbed
- `RecordAttendanceDto` accepts `project_id`, `check_in_at`, `check_out_at` only. §32.4 #9 also
  specifies `method` (QR_CODE/GPS/BIOMETRIC/MANUAL) and `location` on the check-in event; neither is
  captured or emitted — see TDD OQ-36, still open
