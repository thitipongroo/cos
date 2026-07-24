-- Rollback for 20260725000001_add_issue_number_to_issues.
-- Drops the unique index and the nullable column. Safe: the column was additive and nullable, so no
-- deployed code depended on it existing (QM-9), and dropping it loses only the generated numbers.
DROP INDEX IF EXISTS site_ops.uq_issues_tenant_number;

ALTER TABLE site_ops.issues
  DROP COLUMN IF EXISTS issue_number;
