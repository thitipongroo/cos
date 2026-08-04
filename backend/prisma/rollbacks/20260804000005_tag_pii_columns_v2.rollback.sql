-- Rollback: 20260804000005_tag_pii_columns_v2
-- Safe: metadata-only (COMMENT ON COLUMN), same as the migration it extends. No column, type,
-- constraint or row is touched and no application code reads these comments at runtime. The loss is
-- that the PII inventory regenerated from the live schema no longer lists these columns, while
-- data-export.collector.ts still reads them — the scope claim and the tags go out of step until the
-- migration is re-applied.

COMMENT ON COLUMN site_ops.issues.created_by IS NULL;
COMMENT ON COLUMN site_ops.issues.assigned_to IS NULL;

COMMENT ON COLUMN workforce_telemetry.timesheets.regular_hours IS NULL;
COMMENT ON COLUMN workforce_telemetry.timesheets.overtime_hours IS NULL;

COMMENT ON COLUMN finance.payments.recorded_by IS NULL;
