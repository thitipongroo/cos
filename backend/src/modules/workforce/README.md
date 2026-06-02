# workforce

NestJS module for workforce management, attendance tracking, and timesheets.

## Purpose

Manages workers, project allocations, attendance check-in/check-out, and timesheet approval (Phase 22).
Attendance logs and timesheets are stored as TimescaleDB hypertables.
Biometric / QR check-in available via EP-DOMAIN-008.

**Status:** Module scaffolded. Full implementation in Phase 22.

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
```

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

// Record check-out
PATCH /api/v1/workers/uuid/attendance/latest
{ "check_out_at": "2026-06-01T17:00:00Z" }
```

Kafka events emitted: `workforce.checkin.created.v1`, `workforce.checkout`, `workforce.timesheet_approved`

## Notes

- `attendance_logs` hypertable: chunk interval = 1 week; chunk compression after 30 days
- `timesheets` hypertable: partitioned by `period_date` (monthly)
- Employment types: PERMANENT, CONTRACT, SUBCONTRACT
- Biometric / QR check-in: EP-DOMAIN-008 `BiometricCheckIn` stub
- Check-in methods: QR_CODE, GPS, BIOMETRIC, MANUAL
