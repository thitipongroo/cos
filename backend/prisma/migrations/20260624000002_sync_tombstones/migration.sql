-- Generic sync deletion tracking (Finding 2, mixed i+iii).
-- /sync/delta returns deleted[] by reading this table. The deletion CONTRACT is complete here;
-- WIRING each entity's delete to record a tombstone (via SyncService.recordTombstone) is deferred
-- per entity (today no entity records here, so deleted[] is empty until wired — documented TODO).
--
-- Lives in the platform schema (cross-domain). RLS-isolated by tenant_id like other platform tables.

CREATE TABLE IF NOT EXISTS platform.sync_tombstones (
  tombstone_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID         NOT NULL,
  entity_type  VARCHAR(64)  NOT NULL,
  entity_id    UUID         NOT NULL,
  deleted_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Delta query: WHERE tenant_id = ? AND entity_type IN (?) AND deleted_at > since
CREATE INDEX IF NOT EXISTS idx_sync_tombstones_delta
  ON platform.sync_tombstones (tenant_id, entity_type, deleted_at);

-- RLS: tenant isolation, single PERMISSIVE policy (matches the §7.7 / ADR-031 convention).
ALTER TABLE platform.sync_tombstones ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.sync_tombstones FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_tenant_isolation ON platform.sync_tombstones;
CREATE POLICY rls_tenant_isolation ON platform.sync_tombstones
  AS PERMISSIVE
  FOR ALL
  TO app_user
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON platform.sync_tombstones TO app_user;
