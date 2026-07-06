-- Location capture (product-owner escalation): store GPS coordinates on the field-activity records
-- a mobile/web client can geo-tag. These feed the self-host reverse-geocode endpoint
-- (/api/v1/geo/reverse -> Nominatim). Columns are NULLABLE — existing rows have no coordinates.
-- NUMERIC(9,6) covers latitude [-90, 90] / longitude [-180, 180] at ~0.11 m precision.
--
-- Grants: the target tables already have table-level SELECT/INSERT/UPDATE to app_user, which in
-- PostgreSQL automatically covers newly added columns — no additional GRANT is required.

ALTER TABLE workforce_telemetry.attendance_logs
  ADD COLUMN IF NOT EXISTS latitude  NUMERIC(9, 6),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(9, 6);

ALTER TABLE site_ops.site_reports
  ADD COLUMN IF NOT EXISTS latitude  NUMERIC(9, 6),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(9, 6);

ALTER TABLE site_ops.issues
  ADD COLUMN IF NOT EXISTS latitude  NUMERIC(9, 6),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(9, 6);

ALTER TABLE site_ops.incidents
  ADD COLUMN IF NOT EXISTS latitude  NUMERIC(9, 6),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(9, 6);

ALTER TABLE site_ops.inspections
  ADD COLUMN IF NOT EXISTS latitude  NUMERIC(9, 6),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(9, 6);
