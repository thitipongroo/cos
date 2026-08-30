-- Rollback for 20260822000002_site_ops_foreign_keys.
--
-- Drops the eight constraints and the one index the migration added, returning site_ops to the five
-- foreign keys it held before (carbon_records x3, manpower_logs.report_id, material_consumptions.
-- report_id). Verified by diffing pg_constraint before and after.
--
-- IF EXISTS on each, so the rollback is safe to run against a database where the migration failed
-- part way through — which is the state a rollback is most often reached from.

ALTER TABLE site_ops.safety_checklists DROP CONSTRAINT IF EXISTS safety_checklists_project_id_fkey;
ALTER TABLE site_ops.inspections       DROP CONSTRAINT IF EXISTS inspections_task_id_fkey;
ALTER TABLE site_ops.inspections       DROP CONSTRAINT IF EXISTS inspections_checklist_id_fkey;
ALTER TABLE site_ops.inspections       DROP CONSTRAINT IF EXISTS inspections_project_id_fkey;
ALTER TABLE site_ops.issues            DROP CONSTRAINT IF EXISTS issues_task_id_fkey;
ALTER TABLE site_ops.issues            DROP CONSTRAINT IF EXISTS issues_report_id_fkey;
ALTER TABLE site_ops.issues            DROP CONSTRAINT IF EXISTS issues_project_id_fkey;
ALTER TABLE site_ops.site_reports      DROP CONSTRAINT IF EXISTS site_reports_project_id_fkey;

DROP INDEX IF EXISTS site_ops.idx_issues_report;
