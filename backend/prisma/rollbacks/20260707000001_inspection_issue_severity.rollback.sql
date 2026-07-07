-- Rollback for 20260707000001_inspection_issue_severity (QM-9).
-- Drops the additive nullable issue_severity column from site_ops.inspections.
ALTER TABLE site_ops.inspections DROP COLUMN IF EXISTS issue_severity;
