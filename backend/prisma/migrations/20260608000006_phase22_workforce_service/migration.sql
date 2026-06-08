-- Phase 22: Workforce Service
-- Creates: workforce schema (2 tables), workforce_telemetry schema (2 TimescaleDB hypertables)
-- Source: spec §Phase 22 entities

-- ─── Schemas ─────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS workforce;
CREATE SCHEMA IF NOT EXISTS workforce_telemetry;

-- ─── ENUMs ───────────────────────────────────────────────────────────────────
CREATE TYPE workforce.employment_type_enum AS ENUM ('PERMANENT', 'CONTRACT', 'SUBCONTRACT');
CREATE TYPE workforce_telemetry.timesheet_status_enum AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED');

-- ─── workers ─────────────────────────────────────────────────────────────────
CREATE TABLE workforce.workers (
  worker_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  employee_code   VARCHAR(50) NOT NULL,
  full_name       VARCHAR(255) NOT NULL,
  trade_type      VARCHAR(100) NOT NULL,
  employment_type workforce.employment_type_enum NOT NULL,
  contact_phone   VARCHAR(50),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_worker_employee_code UNIQUE (tenant_id, employee_code)
);

ALTER TABLE workforce.workers ENABLE ROW LEVEL SECURITY;

CREATE POLICY workers_tenant_isolation ON workforce.workers
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- ─── project_workforce ────────────────────────────────────────────────────────
CREATE TABLE workforce.project_workforce (
  allocation_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL,
  worker_id       UUID NOT NULL REFERENCES workforce.workers(worker_id),
  tenant_id       UUID NOT NULL,
  role_on_project VARCHAR(100),
  start_date      DATE NOT NULL,
  end_date        DATE,
  daily_rate      DECIMAL(19,4),
  currency_code   VARCHAR(3)
);

ALTER TABLE workforce.project_workforce ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_workforce_tenant_isolation ON workforce.project_workforce
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

CREATE INDEX idx_project_workforce_project ON workforce.project_workforce(project_id);
CREATE INDEX idx_project_workforce_worker ON workforce.project_workforce(worker_id);

-- ─── TimescaleDB hypertable: attendance_logs ─────────────────────────────────
CREATE TABLE workforce_telemetry.attendance_logs (
  log_id       UUID NOT NULL,
  recorded_at  TIMESTAMPTZ NOT NULL,
  worker_id    UUID NOT NULL,
  project_id   UUID NOT NULL,
  tenant_id    UUID NOT NULL,
  check_in_at  TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  hours_worked DECIMAL(5,2)
);

SELECT create_hypertable(
  'workforce_telemetry.attendance_logs',
  'recorded_at',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

CREATE INDEX idx_attendance_worker_time ON workforce_telemetry.attendance_logs
  (worker_id, recorded_at DESC);
CREATE INDEX idx_attendance_project_time ON workforce_telemetry.attendance_logs
  (project_id, recorded_at DESC);

-- ─── TimescaleDB hypertable: timesheets ──────────────────────────────────────
CREATE TABLE workforce_telemetry.timesheets (
  timesheet_id    UUID NOT NULL,
  period_date     DATE NOT NULL,
  worker_id       UUID NOT NULL,
  project_id      UUID NOT NULL,
  tenant_id       UUID NOT NULL,
  regular_hours   DECIMAL(6,2) NOT NULL DEFAULT 0,
  overtime_hours  DECIMAL(6,2) NOT NULL DEFAULT 0,
  status          workforce_telemetry.timesheet_status_enum NOT NULL DEFAULT 'DRAFT'
);

-- Timescale on period_date (monthly partitions)
SELECT create_hypertable(
  'workforce_telemetry.timesheets',
  'period_date',
  chunk_time_interval => INTERVAL '1 month',
  if_not_exists => TRUE
);

CREATE UNIQUE INDEX idx_timesheet_worker_period ON workforce_telemetry.timesheets
  (worker_id, project_id, period_date);

-- ─── GRANT ───────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT USAGE ON SCHEMA workforce TO app_user;
    GRANT USAGE ON SCHEMA workforce_telemetry TO app_user;
    GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA workforce TO app_user;
    GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA workforce_telemetry TO app_user;
  END IF;
END $$;
