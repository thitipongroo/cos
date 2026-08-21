-- Rollback: 20260723000001_add_estimated_completion_date_to_projects
-- Reverses: migrations/20260723000001_add_estimated_completion_date_to_projects/migration.sql
--
-- The migration adds one nullable column and nothing else, so dropping it restores the prior schema
-- exactly. IF EXISTS keeps this idempotent (§9.7.1).
--
-- WARNING: drops every PM-entered projected completion date. The AI delay-risk report (Phase 12)
-- then falls back to projects.end_date, which is the pre-migration behaviour — the forecast changes,
-- it does not fail. Export the column before running if those overrides matter.

ALTER TABLE projects.projects
  DROP COLUMN IF EXISTS estimated_completion_date;
