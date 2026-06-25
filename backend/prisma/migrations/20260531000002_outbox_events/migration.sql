-- Phase 8: Outbox pattern — outbox_events table
-- Created in the platform schema for identity module events.
-- Each tenant schema gets its own outbox_events table when provisioned (Phase 3+).
-- OutboxPoller reads from this table and publishes to Kafka every 500ms.
-- Backward-compatible: new table only, no modifications to existing tables.

SET search_path = platform;

CREATE TABLE platform.outbox_events (
  id           UUID        NOT NULL DEFAULT gen_random_uuid(),
  event_type   VARCHAR(255) NOT NULL,
  payload      JSONB        NOT NULL,
  published    BOOLEAN      NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,

  CONSTRAINT outbox_events_pkey PRIMARY KEY (id)
);

-- Index for OutboxPoller query: unpublished events ordered by created_at
CREATE INDEX outbox_events_unpublished_idx
  ON platform.outbox_events (created_at ASC)
  WHERE published = false;

-- Template for tenant schema outbox_events (used when provisioning new tenants in Phase 3+)
-- Each tenant schema will have its own copy of this table via the tenant provisioning script:
-- CREATE TABLE {tenant_code}.outbox_events (LIKE platform.outbox_events INCLUDING ALL);

-- Restore default search_path so Prisma can record this migration in public._prisma_migrations
-- (the SET above leaks to the session; all DDL here is already schema-qualified). Fixes P1014 on migrate deploy.
RESET search_path;
