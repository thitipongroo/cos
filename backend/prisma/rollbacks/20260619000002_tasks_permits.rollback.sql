-- Rollback: Phase 6 Tasks + Permits increment.
-- Safe to run only when no deployed code references these tables/columns.

DROP INDEX IF EXISTS site_ops.idx_inspections_task;
ALTER TABLE site_ops.inspections DROP COLUMN IF EXISTS task_id;

DROP INDEX IF EXISTS site_ops.idx_issues_task;
ALTER TABLE site_ops.issues
  DROP COLUMN IF EXISTS issue_type,
  DROP COLUMN IF EXISTS task_id;

DROP TABLE IF EXISTS site_ops.permits CASCADE;
DROP TABLE IF EXISTS projects.tasks CASCADE;
