-- Project standard working hours (ADR-072) — the daily working window the SITE_ENGINEER dashboard's
-- time strip reads, and a per-project baseline for a future HR/timesheet module.
-- Source: ADR-072; docs/specifications/11-database-schema §11 (Projects). PO decision 2026-07-25.
-- Two nullable TIME columns (a wall-clock window, no date/zone) — the smallest slice of the Primavera
-- "project calendar" pattern. Backward-compatible: additive nullable columns only (QM-9); pre-existing
-- projects keep NULL and render no strip.
-- Rollback: prisma/rollbacks/20260726000003_add_project_work_hours.rollback.sql

ALTER TABLE projects.projects
  ADD COLUMN IF NOT EXISTS work_hours_start TIME,
  ADD COLUMN IF NOT EXISTS work_hours_end   TIME;
