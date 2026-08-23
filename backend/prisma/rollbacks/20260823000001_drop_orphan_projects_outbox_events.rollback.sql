-- Rollback for 20260823000001_drop_orphan_projects_outbox_events (QM-9).
--
-- Recreates projects.outbox_events exactly as 20260605000004_db_refactor_global_schemas left it:
-- created unqualified by 20260531000003_project_service (landing in `public`), then relocated to
-- `projects`. No code reads or writes this table — the Phase 8 outbox is platform.outbox_events.
-- This script exists solely so the drop is reversible, as QM-9 requires of every migration.

CREATE TABLE IF NOT EXISTS projects.outbox_events (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    VARCHAR(255) NOT NULL,
  payload       JSONB        NOT NULL,
  published     BOOLEAN      NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_outbox_events_unpublished
  ON projects.outbox_events (published, created_at)
  WHERE published = false;
