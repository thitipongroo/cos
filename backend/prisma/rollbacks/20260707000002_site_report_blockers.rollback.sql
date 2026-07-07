-- Rollback for 20260707000002_site_report_blockers (QM-9).
-- Drops the additive nullable blockers column from site_ops.site_reports.
ALTER TABLE site_ops.site_reports DROP COLUMN IF EXISTS blockers;
