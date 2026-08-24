-- Rollback for 20260705000001_geo_coordinates (QM-9: every migration ships a verified rollback,
-- kept OUTSIDE prisma/migrations/ so `prisma migrate deploy` does not treat it as a migration, P3015).
--
-- DESTRUCTIVE: drops the GPS geo-tag on every field-activity record. The records themselves survive
-- (attendance, site reports, issues, incidents, inspections) — only WHERE they happened is lost, and
-- it cannot be recovered from anything else in the database. Re-applying the migration brings the
-- columns back empty, so the reverse-geocode endpoint (/api/v1/geo/reverse -> Nominatim) has nothing
-- to resolve until clients geo-tag again.
--
-- No GRANT/RLS teardown is needed: the migration added columns to tables that already carried
-- table-level grants and their rls_tenant_isolation policy, and dropping a column leaves both intact.

ALTER TABLE workforce_telemetry.attendance_logs
  DROP COLUMN IF EXISTS latitude,
  DROP COLUMN IF EXISTS longitude;

ALTER TABLE site_ops.site_reports
  DROP COLUMN IF EXISTS latitude,
  DROP COLUMN IF EXISTS longitude;

ALTER TABLE site_ops.issues
  DROP COLUMN IF EXISTS latitude,
  DROP COLUMN IF EXISTS longitude;

ALTER TABLE site_ops.incidents
  DROP COLUMN IF EXISTS latitude,
  DROP COLUMN IF EXISTS longitude;

ALTER TABLE site_ops.inspections
  DROP COLUMN IF EXISTS latitude,
  DROP COLUMN IF EXISTS longitude;
