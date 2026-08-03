-- Rollback: 20260803000001_tag_pii_columns
-- Safe: the forward migration is metadata-only (COMMENT ON COLUMN). Setting each comment back to
-- NULL removes the PDPA tags and nothing else — no column, type, constraint or row is touched, and
-- no application code reads these comments at runtime. The only loss is the ability to regenerate
-- the PII inventory from the live schema (the information_schema query in the forward migration),
-- which reverts the domain schemas to being untagged as they were before 2026-08-03.

COMMENT ON COLUMN platform.users.email IS NULL;
COMMENT ON COLUMN platform.users.phone_number IS NULL;
COMMENT ON COLUMN platform.users.display_name IS NULL;

COMMENT ON COLUMN platform.trusted_devices.device_id IS NULL;
COMMENT ON COLUMN platform.trusted_devices.model IS NULL;

COMMENT ON COLUMN platform.audit_logs.actor_id IS NULL;
COMMENT ON COLUMN platform.audit_logs.ip_address IS NULL;
COMMENT ON COLUMN platform.audit_logs.user_agent IS NULL;

COMMENT ON COLUMN files.files.original_filename IS NULL;

COMMENT ON COLUMN workforce.workers.full_name IS NULL;
COMMENT ON COLUMN workforce.workers.contact_phone IS NULL;
COMMENT ON COLUMN workforce.project_workforce.daily_rate IS NULL;
COMMENT ON COLUMN workforce.workers.employee_code IS NULL;

COMMENT ON COLUMN workforce_telemetry.attendance_logs.latitude IS NULL;
COMMENT ON COLUMN workforce_telemetry.attendance_logs.longitude IS NULL;

COMMENT ON COLUMN site_ops.site_reports.latitude IS NULL;
COMMENT ON COLUMN site_ops.site_reports.longitude IS NULL;

COMMENT ON COLUMN site_ops.issues.latitude IS NULL;
COMMENT ON COLUMN site_ops.issues.longitude IS NULL;

COMMENT ON COLUMN site_ops.incidents.latitude IS NULL;
COMMENT ON COLUMN site_ops.incidents.longitude IS NULL;

COMMENT ON COLUMN site_ops.inspections.latitude IS NULL;
COMMENT ON COLUMN site_ops.inspections.longitude IS NULL;
