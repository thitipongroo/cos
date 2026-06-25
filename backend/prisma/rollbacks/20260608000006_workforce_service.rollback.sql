-- Rollback: Phase 22 Workforce Service
-- Reverses: 20260608000006_phase22_workforce_service/migration.sql
-- Drop order: hypertables → tables → ENUMs → schemas (reverse of creation)

-- ─── TimescaleDB hypertables ──────────────────────────────────────────────────
DROP TABLE IF EXISTS workforce_telemetry.timesheets CASCADE;
DROP TABLE IF EXISTS workforce_telemetry.attendance_logs CASCADE;

-- ─── Tables ───────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS workforce.project_workforce CASCADE;
DROP TABLE IF EXISTS workforce.workers CASCADE;

-- ─── ENUM types ───────────────────────────────────────────────────────────────
DROP TYPE IF EXISTS workforce_telemetry.timesheet_status_enum;
DROP TYPE IF EXISTS workforce.employment_type_enum;

-- ─── Schemas ──────────────────────────────────────────────────────────────────
DROP SCHEMA IF EXISTS workforce_telemetry CASCADE;
DROP SCHEMA IF EXISTS workforce CASCADE;
