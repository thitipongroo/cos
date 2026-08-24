-- Rollback: 20260819000003_outbox_delivery_state
--
-- DESTRUCTIVE in one specific way: it drops `last_error`, which is the only record of WHY any stuck
-- event failed. Export the dead letters first if any exist —
--
--   SELECT id, tenant_id, event_type, attempts, last_error, created_at
--     FROM platform.outbox_events WHERE published = false;
--
-- The events themselves survive (id, event_type, payload, published are untouched), so nothing that
-- is still deliverable is lost. But without these columns OutboxPollerService cannot claim a row
-- without racing every other replica for it, and cannot stop retrying a poison message — so roll the
-- application back with this, not just the schema.

DROP INDEX IF EXISTS platform.outbox_events_pending_idx;

ALTER TABLE platform.outbox_events
  DROP COLUMN IF EXISTS attempts,
  DROP COLUMN IF EXISTS last_error,
  DROP COLUMN IF EXISTS next_attempt_at,
  DROP COLUMN IF EXISTS tenant_id;

CREATE INDEX IF NOT EXISTS outbox_events_unpublished_idx
  ON platform.outbox_events (created_at ASC)
  WHERE published = false;
