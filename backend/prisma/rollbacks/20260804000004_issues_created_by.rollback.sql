-- Rollback for 20260804000004_issues_created_by.
--
-- Drops the two export indexes and the nullable column. The column was additive and nullable (QM-9),
-- so no deployed code depends on it existing.
--
-- WHAT IS LOST: the record of who raised each issue, for every issue created while the column
-- existed. It cannot be reconstructed afterwards — audit_logs carries no resource_id and the outbox
-- is a transient queue — so re-applying the migration starts attribution over from that moment, and
-- PDPA exports issued in between will under-report the subject's own issues.
DROP INDEX IF EXISTS site_ops.idx_issues_assigned_to;
DROP INDEX IF EXISTS site_ops.idx_issues_created_by;

ALTER TABLE site_ops.issues
  DROP COLUMN IF EXISTS created_by;
