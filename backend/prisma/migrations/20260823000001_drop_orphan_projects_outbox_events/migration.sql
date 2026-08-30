-- Drop the orphan projects.outbox_events table (docs/architecture/test-design/escalation-register.md §35.13 ESC-17).
--
-- Origin: 20260531000003_project_service issued an UNQUALIFIED
--   CREATE TABLE IF NOT EXISTS outbox_events
-- which resolved through search_path into `public`; 20260605000004_db_refactor_global_schemas then
-- relocated it to `projects`. That unqualified DDL is itself the QM-4 violation ("all SQL must use
-- schema-qualified names") that produced the stray table.
--
-- The Phase 8 outbox is platform.outbox_events — the only table OutboxPublisher writes and
-- OutboxPoller reads (packages/@cos/kafka/src/outbox.ts). Nothing in the repository references
-- projects.outbox_events; it has never been written to or relayed.
--
-- SAFETY: the table is dropped ONLY when empty. If any environment turns out to hold rows, this
-- migration raises and the deploy stops rather than silently destroying unrelayed events — drain
-- or archive them first, then re-run. This is deliberate: whether a given environment has rows
-- cannot be known from the repository.

DO $$
DECLARE
  remaining bigint;
BEGIN
  IF to_regclass('projects.outbox_events') IS NULL THEN
    RAISE NOTICE 'projects.outbox_events does not exist - nothing to drop (ESC-17)';
    RETURN;
  END IF;

  EXECUTE 'SELECT count(*) FROM projects.outbox_events' INTO remaining;

  IF remaining > 0 THEN
    RAISE EXCEPTION
      'projects.outbox_events holds % row(s); refusing to drop (ESC-17). Relay or archive them, then re-run this migration.',
      remaining;
  END IF;

  -- Drops the table and its idx_outbox_events_unpublished index together.
  DROP TABLE projects.outbox_events;
  RAISE NOTICE 'projects.outbox_events dropped (ESC-17)';
END
$$;
