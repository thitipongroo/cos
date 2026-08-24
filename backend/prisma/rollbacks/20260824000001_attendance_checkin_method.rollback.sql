-- Rollback for 20260824000001_attendance_checkin_method.
--
-- ⚠️ REVERT THE APPLICATION FIRST. WorkforceService reads `method` off the row to populate
-- `workforce.checkin.created.v1`; dropping the column under a running backend makes every check-in
-- fail on `column "method" does not exist`, which is a hard error on a route field workers use all
-- day, not a degradation.
--
-- Dropping the column discards every recorded method permanently. The events already on the topic
-- keep theirs — Kafka retains what was published — but nothing in PostgreSQL can reconstruct it.

ALTER TABLE workforce_telemetry.attendance_logs
  DROP CONSTRAINT IF EXISTS attendance_logs_method_check;

ALTER TABLE workforce_telemetry.attendance_logs
  DROP COLUMN IF EXISTS method;
