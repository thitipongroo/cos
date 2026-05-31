-- Rollback: Phase 8 outbox_events table
DROP INDEX IF EXISTS platform.outbox_events_unpublished_idx;
DROP TABLE IF EXISTS platform.outbox_events;
