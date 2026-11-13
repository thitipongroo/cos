-- Tenant-leading indexes on the workforce telemetry hypertables (D57, 2026-11-13).
--
-- WHY
-- ---
-- `workforce_telemetry.attendance_logs` and `.timesheets` had no index that starts with tenant_id
-- (idx_attendance_worker_time, idx_attendance_project_time, idx_timesheet_worker_period). Reads that filter by
-- tenant alone — enterprise provisioning's copy (`COPY (SELECT … WHERE tenant_id = …)`, its per-table counts and
-- has-data check) and the row-level-security predicate — scanned every chunk of every tenant. Measured on
-- TimescaleDB 2.31 with generated data (200,000 attendance rows in 60 daily chunks, 120,000 timesheets in 24
-- monthly chunks, 50 tenants): one tenant's count went from a sequential scan of every chunk (2,700 and 1,608
-- buffers) to index scans only (390 and 852 buffers). equipment_telemetry.equipment_utilization already has one
-- (its natural-key unique index).
--
-- LOCKING
-- -------
-- On a hypertable this builds every chunk's index in one transaction and blocks writes to the table while it
-- runs: 170 ms and 80 ms on the data above. Where the tables are already large, build them beforehand by hand,
-- one chunk per transaction, and this migration then does nothing (IF NOT EXISTS):
--
--   CREATE INDEX idx_attendance_tenant_time ON workforce_telemetry.attendance_logs (tenant_id, recorded_at DESC)
--     WITH (timescaledb.transaction_per_chunk);
--   CREATE INDEX idx_timesheet_tenant_period ON workforce_telemetry.timesheets (tenant_id, period_date DESC)
--     WITH (timescaledb.transaction_per_chunk);
--
-- A prebuild that is interrupted (a cancel, statement_timeout, a lost connection) leaves the index INVALID with
-- only some chunks indexed, and IF NOT EXISTS alone would skip it as if it were done (reproduced: 20 of 60 chunks
-- indexed, the migration "skipping"). So the block below refuses to run over an invalid index: drop it and build
-- again.
--
-- Each insert into the two tables now maintains one more index (attendance_logs: 4, timesheets: 3). Both are
-- written per check-in or per period, not per sensor reading.
--
-- BACKWARD-COMPATIBLE (QM-9)
-- --------------------------
-- Adds indexes only. Re-runnable: IF NOT EXISTS.
--
-- Rollback: prisma/rollbacks/20261113000002_telemetry_tenant_indexes.rollback.sql

DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO bad
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'workforce_telemetry'
     AND c.relname IN ('idx_attendance_tenant_time', 'idx_timesheet_tenant_period')
     AND NOT i.indisvalid;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'invalid index(es) % — an interrupted prebuild; DROP INDEX workforce_telemetry.<name> and build again', bad;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_attendance_tenant_time
  ON workforce_telemetry.attendance_logs (tenant_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_timesheet_tenant_period
  ON workforce_telemetry.timesheets (tenant_id, period_date DESC);
