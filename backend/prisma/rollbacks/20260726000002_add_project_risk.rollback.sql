-- Rollback for 20260726000002_add_project_risk.
-- Drops the whole table (RLS policy, index, generated column, and grants go with it). Safe: the table
-- was additive (QM-9) — no pre-existing code or column depended on it. The ON DELETE CASCADE FK is
-- from project_risk → projects, so dropping this table does not touch projects.projects.
DROP TABLE IF EXISTS projects.project_risk;
