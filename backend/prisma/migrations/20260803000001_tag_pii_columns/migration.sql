-- Tag every personal-data column with its PDPA category as a PostgreSQL column comment.
--
-- Why a DB comment and not only a Prisma `@pdpa(...)` comment (QM-5): only the `platform` and
-- `files` schemas are Prisma models (`datasource.schemas = ["platform", "files"]`). The domain
-- schemas — workforce, workforce_telemetry, site_ops — are raw-SQL migrations and cannot carry a
-- Prisma attribute at all, so QM-5's tagging obligation had no mechanism there and the PII in those
-- tables was untagged (found 2026-08-03 while auditing docs/registers/data-flow-map.md).
--
-- A COMMENT ON COLUMN reaches every table regardless of how it was created, survives in the database
-- itself, and is queryable — so the PII inventory can be regenerated from the live schema instead of
-- being maintained by hand in a document that drifts:
--
--   SELECT c.table_schema, c.table_name, c.column_name,
--          col_description(to_regclass(c.table_schema||'.'||c.table_name)::oid, c.ordinal_position)
--     FROM information_schema.columns c
--    WHERE col_description(to_regclass(c.table_schema||'.'||c.table_name)::oid,
--                          c.ordinal_position) LIKE '@pdpa%';
--
-- Categories are the vocabulary already in use: the data-flow-map set (identity, contact, location,
-- financial) plus the two the Prisma schema already uses for indirect data (operational). No new
-- category is invented here.
--
-- This migration is metadata-only: it adds no column, changes no type, and reads no data, so it is
-- backward-compatible by construction (QM-9) — old code is unaffected. Rollback:
-- prisma/rollbacks/20260803000001_tag_pii_columns.rollback.sql

-- ─── platform schema (mirrors the existing @pdpa comments in schema.prisma) ───────────────────
COMMENT ON COLUMN platform.users.email IS '@pdpa(category: "contact") — email is personal data';
COMMENT ON COLUMN platform.users.phone_number IS '@pdpa(category: "contact") — phone number is PII (Path A users)';
COMMENT ON COLUMN platform.users.display_name IS '@pdpa(category: "identity") — display name is personal data';

COMMENT ON COLUMN platform.trusted_devices.device_id IS '@pdpa(category: "identity") — per-install identifier for a person''s device';
COMMENT ON COLUMN platform.trusted_devices.model IS '@pdpa(category: "identity") — device model narrows identification';

COMMENT ON COLUMN platform.audit_logs.actor_id IS '@pdpa(category: "operational") — traces to a user but is not directly PII';
COMMENT ON COLUMN platform.audit_logs.ip_address IS '@pdpa(category: "operational") — network identifier, personal data under GDPR Rec. 30';
COMMENT ON COLUMN platform.audit_logs.user_agent IS '@pdpa(category: "operational") — device/browser fingerprint surface';

-- ─── files schema ────────────────────────────────────────────────────────────────────────────
COMMENT ON COLUMN files.files.original_filename IS '@pdpa(category: "operational") — filename may embed personal data (e.g. id-card-somchai.pdf)';

-- ─── workforce (previously untagged — no Prisma model exists for these) ───────────────────────
COMMENT ON COLUMN workforce.workers.full_name IS '@pdpa(category: "identity") — worker full name';
COMMENT ON COLUMN workforce.workers.contact_phone IS '@pdpa(category: "contact") — worker phone number';
COMMENT ON COLUMN workforce.workers.employee_code IS '@pdpa(category: "identity") — employer-assigned identifier for a person';
COMMENT ON COLUMN workforce.project_workforce.daily_rate IS '@pdpa(category: "financial") — agreed pay rate for a named worker';

-- ─── location: GPS is captured on FIVE tables, not only at check-in ──────────────────────────
-- (migration 20260705000001_geo_coordinates). Retention differs per table — attendance is purged at
-- 90 days; the other four persist with their parent record. See docs/policies/data-retention-policy.md.
COMMENT ON COLUMN workforce_telemetry.attendance_logs.latitude IS '@pdpa(category: "location") — check-in/out GPS; 90-day retention';
COMMENT ON COLUMN workforce_telemetry.attendance_logs.longitude IS '@pdpa(category: "location") — check-in/out GPS; 90-day retention';

COMMENT ON COLUMN site_ops.site_reports.latitude IS '@pdpa(category: "location") — geo-tagged daily site report';
COMMENT ON COLUMN site_ops.site_reports.longitude IS '@pdpa(category: "location") — geo-tagged daily site report';

COMMENT ON COLUMN site_ops.issues.latitude IS '@pdpa(category: "location") — geo-tagged issue';
COMMENT ON COLUMN site_ops.issues.longitude IS '@pdpa(category: "location") — geo-tagged issue';

COMMENT ON COLUMN site_ops.incidents.latitude IS '@pdpa(category: "location") — geo-tagged safety incident';
COMMENT ON COLUMN site_ops.incidents.longitude IS '@pdpa(category: "location") — geo-tagged safety incident';

COMMENT ON COLUMN site_ops.inspections.latitude IS '@pdpa(category: "location") — geo-tagged inspection';
COMMENT ON COLUMN site_ops.inspections.longitude IS '@pdpa(category: "location") — geo-tagged inspection';
