-- Rollback for 20260726000003_add_project_work_hours.
-- Drops the two additive nullable TIME columns. Safe (QM-9): they were additive and nullable, so no
-- deployed code depended on them existing; dropping loses only the configured working windows.
ALTER TABLE projects.projects
  DROP COLUMN IF EXISTS work_hours_start,
  DROP COLUMN IF EXISTS work_hours_end;
