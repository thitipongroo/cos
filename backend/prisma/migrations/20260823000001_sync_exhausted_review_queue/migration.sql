-- The tenant-admin review queue for sync items that exhausted their retries (master:3685-3698).
--
-- WHY IT EXISTS. §17.2 says a safety incident that fails to sync five times must be published to
-- `platform.sync.exhausted`, land on a review queue a TENANT_ADMIN can see, and alert the PM and the
-- Safety Officer — and that the device must KEEP the record "until synced or admin-resolved". None
-- of that existed: no event, no schema, no table. The device gave up after five attempts and nobody
-- was told, so an incident recorded on site could simply cease to exist.
--
-- WHAT A ROW MEANS. A device could not deliver this mutation. The payload is the device's copy,
-- stored verbatim so an administrator can see what was captured without the phone in their hand. The
-- row is a REPORT, not the record itself: resolving it does not create the incident, it closes the
-- loop on a delivery that failed.
--
-- client_id is the device-generated id the mutation carried, and it is UNIQUE per tenant: a device
-- that reports the same exhausted item on two cycles must not fill the queue with duplicates of one
-- lost record. ON CONFLICT DO NOTHING at the call site relies on it.

CREATE TABLE IF NOT EXISTS platform.sync_exhausted_items (
  item_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  entity_type     VARCHAR(64) NOT NULL,
  entity_id       UUID NOT NULL,
  operation       VARCHAR(16) NOT NULL,
  client_id       VARCHAR(128) NOT NULL,
  payload         JSONB,
  retry_count     INTEGER NOT NULL DEFAULT 0,
  reported_by     UUID,
  reported_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_by     UUID,
  resolved_at     TIMESTAMPTZ,
  resolution_note TEXT,
  CONSTRAINT sync_exhausted_items_operation_check CHECK (operation IN ('CREATE', 'UPDATE'))
);

-- One report per lost record per tenant.
CREATE UNIQUE INDEX IF NOT EXISTS sync_exhausted_items_tenant_client_uq
  ON platform.sync_exhausted_items (tenant_id, client_id);

-- The queue is read as "what is still outstanding for this tenant", newest first.
CREATE INDEX IF NOT EXISTS sync_exhausted_items_tenant_unresolved_idx
  ON platform.sync_exhausted_items (tenant_id, resolved_at, reported_at DESC);

-- ADR-031 canonical form: FORCE, one PERMISSIVE policy TO app_user, NULLIF-hardened, WITH CHECK.
-- NULLIF matters here as everywhere: an unset GUC becomes NULL, which matches no row rather than
-- every row.
ALTER TABLE platform.sync_exhausted_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.sync_exhausted_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_tenant_isolation ON platform.sync_exhausted_items;
CREATE POLICY rls_tenant_isolation ON platform.sync_exhausted_items
  FOR ALL TO app_user
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON platform.sync_exhausted_items TO app_user;
