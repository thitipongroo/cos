-- Rollback for 20260726000001_add_project_phases.
-- Drops the whole table (RLS policy, unique constraint, index, and grants go with it). Safe: the table
-- was additive (QM-9) — no pre-existing code or column depended on it — so dropping it only loses the
-- phase rows. The ON DELETE CASCADE FK is from project_phases → projects, so dropping this table does
-- not touch projects.projects.
DROP TABLE IF EXISTS projects.project_phases;
