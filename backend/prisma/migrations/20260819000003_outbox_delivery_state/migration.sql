-- platform.outbox_events: delivery state, so the table can actually be used (ADR-094).
--
-- WHAT WAS WRONG
-- --------------
-- Twelve domain services published to Kafka inline and swallowed the failure with a log line reading
-- "outbox pattern picks up failures (Phase 8)". Nothing picked them up. The table below was created
-- in 20260531000002 and OutboxPublisher/OutboxPoller were written in @cos/shared, but no file under
-- backend/src ever imported either, and main.ts never started the poller. A broker hiccup therefore
-- dropped the domain event permanently, and the comment said otherwise — which is worse than no
-- comment, because it is the reason nobody went looking.
--
-- Services now write here instead of publishing inline (shared/events/event-outbox.service.ts), and
-- OutboxPollerService drains the table. That needs three things the original table did not have.
--
-- 1. RETRY STATE. `published = false` alone cannot distinguish "not tried yet" from "tried and
--    failed", so a permanently-undeliverable row (an event type with no Avro schema, say) would be
--    retried every 500ms forever, ahead of the healthy rows behind it.
-- 2. A CLAIM. Every replica polls, so two of them selecting the same row means the same event is
--    published twice. `next_attempt_at` doubles as the reservation: the claim UPDATE moves it into
--    the future, and the row is invisible to other pollers until then.
-- 3. tenant_id. The envelope carries it inside `payload`, but an operator asking "what is stuck, and
--    whose is it?" should not have to reach into JSON to find out.

ALTER TABLE platform.outbox_events
  -- Incremented when a row is CLAIMED, not when it fails: a poller that dies mid-publish never gets
  -- to record anything, and an attempt counter that only counts clean failures would never retire a
  -- row that crashes the process every time it is tried.
  ADD COLUMN attempts        INT         NOT NULL DEFAULT 0,
  -- Why the last attempt failed. The only diagnostic an operator has for a stuck row — the poller's
  -- own logs have rotated away long before anyone looks at a dead letter.
  ADD COLUMN last_error      TEXT,
  -- Both the retry schedule and the inter-replica claim. Defaults to now() so every existing row and
  -- every new insert is immediately eligible.
  ADD COLUMN next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Denormalised from the envelope for operability (see 3 above). Nullable: rows written before this
  -- migration have no column to copy from, and platform-scope events carry the literal 'platform'
  -- rather than a UUID, so this is TEXT and not a typed FK.
  ADD COLUMN tenant_id       TEXT;

-- The poller's query is (published = false AND attempts < max AND next_attempt_at <= now()) ordered
-- by created_at. The old index keyed only created_at, so every poll — twice a second, per replica —
-- read rows that were merely backing off. Leading with next_attempt_at lets the index skip them.
DROP INDEX IF EXISTS platform.outbox_events_unpublished_idx;

CREATE INDEX outbox_events_pending_idx
  ON platform.outbox_events (next_attempt_at ASC, created_at ASC)
  WHERE published = false;

-- DEAD LETTERS. A row that exhausts its attempts is not deleted and not flagged with a separate
-- column — it simply stops being claimed, and stays queryable as the thing it is:
--
--   SELECT id, tenant_id, event_type, attempts, last_error, created_at
--     FROM platform.outbox_events
--    WHERE published = false AND attempts >= 10
--    ORDER BY created_at;
--
-- Re-drive one after fixing the cause with:
--   UPDATE platform.outbox_events
--      SET attempts = 0, next_attempt_at = now(), last_error = NULL
--    WHERE id = '…';
-- Republishing is safe: the envelope keeps its original event_id and KafkaConsumer dedupes on it.

-- Written by the privileged DATABASE_URL connection like the other platform tables; app_user granted
-- so the schema stays uniform (cf. 20260623000001_app_user_login_and_grants).
GRANT SELECT, INSERT, UPDATE, DELETE ON platform.outbox_events TO app_user;
