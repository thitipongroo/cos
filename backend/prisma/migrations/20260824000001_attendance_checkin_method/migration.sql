-- Capture HOW a worker checked in (product-owner decision 2026-08-24).
--
-- `workforce.checkin.created.v1` has declared a `method` field since the schema was written —
-- ["null", enum QR_CODE|GPS|BIOMETRIC|MANUAL] — and ClickHouse has carried a `method String` column
-- for it in the analytics Kafka table all along. Every event ever emitted has sent null, because
-- there was nowhere to get the value from: no field on RecordAttendanceDto and no column here. The
-- payload was completed on 2026-08-23 (TDD OQ-36) with `method: null` recorded explicitly as
-- "ship what exists, defer the capture" — this is that capture.
--
-- NULLABLE, and it stays nullable: every row written before today genuinely has no recorded method,
-- and a default would assert something about them that nobody measured. Null means "not recorded",
-- which a consumer must be able to tell apart from MANUAL ("a person typed this in").
--
-- The check constraint rather than a Postgres ENUM type: the four values are fixed by the Avro
-- schema, and widening a CHECK is one migration while widening an enum type is a migration plus a
-- lock on every table that uses it. The set is small and owned elsewhere.
--
-- Grants: the table already has table-level SELECT/INSERT/UPDATE to app_user, which in PostgreSQL
-- automatically covers a newly added column — no additional GRANT (same as 20260705000001).

ALTER TABLE workforce_telemetry.attendance_logs
  ADD COLUMN IF NOT EXISTS method VARCHAR(9);

ALTER TABLE workforce_telemetry.attendance_logs
  DROP CONSTRAINT IF EXISTS attendance_logs_method_check;

ALTER TABLE workforce_telemetry.attendance_logs
  ADD CONSTRAINT attendance_logs_method_check
  CHECK (method IS NULL OR method IN ('QR_CODE', 'GPS', 'BIOMETRIC', 'MANUAL'));
