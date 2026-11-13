-- Rollback: 20261113000002_telemetry_tenant_indexes
--
-- Drops the two tenant-leading indexes D57 added. Nothing depends on them; reads filtered by tenant alone go back
-- to scanning every chunk. Re-runnable: IF EXISTS.

DROP INDEX IF EXISTS workforce_telemetry.idx_attendance_tenant_time;
DROP INDEX IF EXISTS workforce_telemetry.idx_timesheet_tenant_period;
