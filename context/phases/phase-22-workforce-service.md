# Phase 22 — Workforce Service

> Moved out of `context/00_master_construction_os.md` on 2026-09-02, verbatim.
> That file keeps the index row pointing here; `.claude/skills/phase-index/SKILL.md`
> is the map. Depends on Phase 2, 3 · SaaS Maturity Stage —.
>
> Rule 36 applies at the end of this phase and Rule 38 before it starts.

```text
Build Workforce Service.

Purpose: manage workers, attendance, timesheets, and workforce allocation.
Time-series data (attendance, hours): stored in TimescaleDB.

Entities (PostgreSQL — schema: workforce):
  workers:
    worker_id       UUID PK
    tenant_id       UUID NOT NULL
    employee_code   VARCHAR(50) NOT NULL
    full_name       VARCHAR(255) NOT NULL
    trade_type      VARCHAR(100) NOT NULL  — e.g. "Carpenter", "Welder", "Electrician"
    employment_type ENUM('PERMANENT','CONTRACT','SUBCONTRACT')
    contact_phone   VARCHAR(50)
    is_active       BOOLEAN DEFAULT true
    created_at      TIMESTAMPTZ DEFAULT now()
    UNIQUE: (tenant_id, employee_code)

  project_workforce:
    allocation_id   UUID PK
    project_id      UUID NOT NULL
    worker_id       UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    role_on_project VARCHAR(100)
    start_date      DATE NOT NULL
    end_date        DATE
    daily_rate      DECIMAL(19,4)
    currency_code   VARCHAR(3)

TimescaleDB Tables (schema: workforce_telemetry):
  attendance_logs (TimescaleDB hypertable):
    log_id          UUID NOT NULL
    recorded_at     TIMESTAMPTZ NOT NULL  — partition key
    worker_id       UUID NOT NULL
    project_id      UUID NOT NULL
    tenant_id       UUID NOT NULL
    check_in_at     TIMESTAMPTZ
    check_out_at    TIMESTAMPTZ
    hours_worked    DECIMAL(5,2)
    INDEX: (worker_id, recorded_at DESC)
    INDEX: (project_id, recorded_at DESC)

  timesheets (TimescaleDB hypertable):
    timesheet_id    UUID NOT NULL
    period_date     DATE NOT NULL         — partition key (by month)
    worker_id       UUID NOT NULL
    project_id      UUID NOT NULL
    tenant_id       UUID NOT NULL
    regular_hours   DECIMAL(6,2) DEFAULT 0
    overtime_hours  DECIMAL(6,2) DEFAULT 0
    status          ENUM('DRAFT','SUBMITTED','APPROVED')

  Biometric / QR check-in: generic SDK interface; vendor SDK injected via DI (see spec §13.5)
    Trigger: project uses biometric or QR attendance
    Interface: { verifyCheckIn(workerId: string, projectId: string,
                               method: 'QR'|'FINGERPRINT'|'FACE'): Promise<boolean> }

APIs:
  POST /api/v1/workers                              — create worker
  GET  /api/v1/workers                              — list workers (tenant-scoped)
  GET  /api/v1/workers/:id                          — get detail
  POST /api/v1/projects/:projectId/workforce        — allocate worker to project
  GET  /api/v1/projects/:projectId/workforce        — list project workforce
  POST /api/v1/workers/:id/attendance               — record check-in/check-out
  GET  /api/v1/workers/:id/attendance               — attendance history (date range)
  POST /api/v1/timesheets                           — submit timesheet
  PATCH /api/v1/timesheets/:id/approve             — approve timesheet (ROLE: SITE_ENGINEER)
  GET  /api/v1/projects/:projectId/workforce/summary — manpower summary for analytics

Generate:

- NestJS module, service, repository, controller
- TimescaleDB hypertable migrations (attendance_logs, timesheets)
- Biometric check-in (deferred — do not implement until spec defines it)
- OpenAPI 3.1 spec
- Unit tests: attendance calculation, timesheet aggregation
- Integration tests: check-in/out cycle
- Kafka event producers:

    workforce.checkin.created.v1    { checkin_id, worker_id, project_id, checkin_at, method,
                                      location }
      NOTE: this line said { worker_id, project_id, checked_in_at } until 2026-08-24 — three
      fields, one of them misnamed, which is exactly what the service emitted and why NO
      check-in event ever reached Kafka (TDD OQ-36: it could not be Avro-encoded, and since
      ADR-094 that fails in the outbox poller). The six-field form above is §32.4 #9.
      `method` is nullable and the capture was built 2026-08-24 (migration 20260824000001):
      it is what the CLIENT asserts, never derived from the presence of coordinates, and
      absent means NOT RECORDED — which is not the same as MANUAL.
    workforce.checkout.created.v1   { worker_id, project_id, hours_worked }
    workforce.timesheet.approved.v1 { worker_id, project_id, period_date, total_hours }

Constraints:

- Before marking Phase 22 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```
