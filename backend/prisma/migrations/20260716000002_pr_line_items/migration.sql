-- Purchase-request line items (product-owner decision 2026-07-16; 11-database-schema §Procurement).
--
-- purchase_requests could record that a request exists (pr_number, required_date, status) but not
-- what was being asked for: §11 puts description/quantity/unit on the PR itself, and none of the
-- three were ever implemented. A site engineer raising "20 tons of rebar by Friday" had nowhere to
-- put the rebar. Rather than adding three columns and capping a request at one material, a PR gets
-- line items — mirroring po_line_items, which the downstream PO already uses.
--
-- No unit_price / line_total here, unlike po_line_items: a request states a need, and pricing only
-- exists once vendors quote against the RFQ (§32.6 RFQ workflow).

CREATE TABLE IF NOT EXISTS procurement.pr_line_items (
  line_id     UUID          NOT NULL DEFAULT gen_random_uuid(),
  pr_id       UUID          NOT NULL REFERENCES procurement.purchase_requests (pr_id) ON DELETE CASCADE,
  tenant_id   UUID          NOT NULL,
  -- Optional catalogue link (procurement.materials). Free-text description stays authoritative:
  -- site needs are not always in the catalogue, and a request must never be blocked on cataloguing.
  material_id UUID,
  description TEXT          NOT NULL,
  quantity    DECIMAL(10,4) NOT NULL CHECK (quantity > 0),
  unit        VARCHAR(50)   NOT NULL,
  sort_order  INTEGER       NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pr_line_items_pkey PRIMARY KEY (line_id)
);

CREATE INDEX IF NOT EXISTS idx_pr_line_items_pr ON procurement.pr_line_items (pr_id);
CREATE INDEX IF NOT EXISTS idx_pr_line_items_tenant ON procurement.pr_line_items (tenant_id);

-- Tenant isolation, identical to what 20260608000004_rls_policies applies to every table carrying a
-- tenant_id. Spelled out here rather than left to a re-run of that migration: ENABLE without the
-- policy would deny app_user everything, and a new table must not depend on an older migration being
-- replayed to become reachable.
ALTER TABLE procurement.pr_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.pr_line_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_tenant_isolation ON procurement.pr_line_items;

CREATE POLICY rls_tenant_isolation ON procurement.pr_line_items
  AS PERMISSIVE
  FOR ALL
  TO app_user
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid);
