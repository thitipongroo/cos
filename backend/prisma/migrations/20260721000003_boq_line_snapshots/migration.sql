-- Materialized BOQ line snapshot (ADR-058 CT-2c-2). Finance consumes construction.boq.items_published.v1
-- (emitted on BOQ version approval) into a per-version read-model, so contract-document generation reads
-- the itemized schedule WITHOUT a direct cross-schema BOQ read — finance is event-driven (no direct DB
-- access to other schemas). Replace-on-event semantics keyed by version_id (idempotent re-delivery).
--
-- Column types mirror the source boq_items (item_code/description/unit/quantity/unit_cost/estimated_total).
-- Tenant-scoped: RLS by tenant_id. This is a derived read-model, so it legitimately uses hard DELETE
-- (replace-on-event) — unlike the soft-delete business tables.

CREATE TABLE finance.boq_line_snapshots (
  snapshot_line_id UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID          NOT NULL,
  version_id       UUID          NOT NULL,
  project_id       UUID          NOT NULL,
  line_no          INTEGER       NOT NULL,
  item_code        VARCHAR(100),
  description      TEXT          NOT NULL,
  unit             VARCHAR(50)   NOT NULL,
  quantity         DECIMAL(10,4) NOT NULL,
  unit_cost        DECIMAL(19,4) NOT NULL,
  estimated_total  DECIMAL(19,4) NOT NULL,
  materialized_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_boq_snapshots_version ON finance.boq_line_snapshots (version_id, tenant_id, line_no);
CREATE INDEX idx_boq_snapshots_project ON finance.boq_line_snapshots (project_id, tenant_id);

-- ─── RLS: tenant isolation (finance standard policy) ─────────────────────────

DO $$ BEGIN
  ALTER TABLE finance.boq_line_snapshots ENABLE ROW LEVEL SECURITY;
  ALTER TABLE finance.boq_line_snapshots FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS rls_tenant_isolation ON finance.boq_line_snapshots;
  CREATE POLICY rls_tenant_isolation ON finance.boq_line_snapshots
    AS PERMISSIVE FOR ALL TO app_user
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);
END $$;

-- ─── Grants (app_user; materialized read-model → hard DELETE allowed for replace-on-event) ───

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON finance.boq_line_snapshots TO app_user;
  END IF;
END $$;
