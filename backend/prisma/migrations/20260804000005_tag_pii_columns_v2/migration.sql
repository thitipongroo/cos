-- Extend the @pdpa column taxonomy (20260803000001) to the columns the export collector now reads.
--
-- The tag comments are the authoritative scope statement: data-export.collector.ts asserts that every
-- table it touches is there because a column on it was tagged. Adding tables to the collector without
-- tagging them here would make that assertion false and leave the next scope audit reading a stale
-- list. Same reasoning as the original migration — a COMMENT ON COLUMN travels with the database and
-- survives a schema dump, so the classification cannot drift away from the table it describes.
--
-- Rollback: prisma/rollbacks/20260804000005_tag_pii_columns_v2.rollback.sql

-- Who raised a geo-tagged issue (20260804000004). Classified `location` rather than `operational`:
-- the column's export significance is that it attaches a latitude/longitude — a record of where a
-- person physically was — to that person. `assigned_to` carries the same weight and is tagged with it.
COMMENT ON COLUMN site_ops.issues.created_by IS '@pdpa(category: "location") — attributes a geo-tagged issue to the person who raised it';
COMMENT ON COLUMN site_ops.issues.assigned_to IS '@pdpa(category: "location") — attributes a geo-tagged issue to the person it was assigned to';

-- Hours worked. Untagged until now, which understated the financial category: `daily_rate` alone is
-- the agreed rate, and rate WITHOUT hours does not tell a person what their work was worth. There is
-- no payroll table in this schema, so these two columns are the closest thing to earnings the
-- platform holds about a worker.
COMMENT ON COLUMN workforce_telemetry.timesheets.regular_hours IS '@pdpa(category: "financial") — hours worked by a named worker; basis of pay';
COMMENT ON COLUMN workforce_telemetry.timesheets.overtime_hours IS '@pdpa(category: "financial") — overtime worked by a named worker; basis of pay';

-- Who recorded a payment. Deliberately `operational`, not `financial`: this traces an ACTION to a
-- user, exactly as platform.audit_logs.actor_id does. The money is the tenant's, not the recorder's —
-- so the amount columns stay untagged and out of any individual's export.
COMMENT ON COLUMN finance.payments.recorded_by IS '@pdpa(category: "operational") — traces a payment entry to the user who recorded it; not that user''s own money';
