-- PM-entered projected completion date for projects.projects (11-database-schema §11.2; Phase 12
-- Delay Risk Detection). Entered manually by the PM via PATCH /api/v1/projects/:id and consumed by
-- the AI delay-risk report as the schedule baseline; when NULL it falls back to end_date (the planned
-- end). Nullable with no default -- a project has no PM override until one is entered, which is
-- exactly the NULL-means-fall-back-to-end_date semantics the spec requires.
--
-- IF NOT EXISTS keeps the add idempotent + backward-compatible (QM-9): existing rows take NULL and
-- code that predates the column keeps working. projects.projects is tenant-scoped under RLS; the
-- table-level grant already covers the new column.

ALTER TABLE projects.projects
  ADD COLUMN IF NOT EXISTS estimated_completion_date DATE;
