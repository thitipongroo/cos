-- Phase 7 addendum: add wht_certificate_ref to payments and create wht_rules table.
-- Backward-compatible: ALTER TABLE adds a nullable column; new table is additive.
-- Authoritative: spec §13.3 (13-product-architecture.md) — WHT Rules.

-- ─── payments: add WHT certificate reference ─────────────────────────────────
ALTER TABLE finance.payments
  ADD COLUMN IF NOT EXISTS wht_certificate_ref VARCHAR(255);

-- ─── wht_rules ────────────────────────────────────────────────────────────────
-- Stores WHT rates per tenant / jurisdiction / service_type.
-- Thailand defaults (3% services, 5% rent) are seeded at tenant provisioning (Phase 25).
-- TENANT_ADMIN can add/override per jurisdiction via admin UI.

CREATE TABLE IF NOT EXISTS finance.wht_rules (
  rule_id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID          NOT NULL,
  jurisdiction_code VARCHAR(10)   NOT NULL,  -- ISO 3166-1 alpha-2 (e.g. TH, SG, MY)
  service_type      VARCHAR(100)  NOT NULL,  -- e.g. "services", "rent", "royalties"
  rate              DECIMAL(5,2)  NOT NULL,  -- e.g. 3.00 = 3%
  is_active         BOOLEAN       NOT NULL DEFAULT true,
  CONSTRAINT wht_rules_unique UNIQUE (tenant_id, jurisdiction_code, service_type)
);

CREATE INDEX IF NOT EXISTS idx_wht_rules_lookup
  ON finance.wht_rules (tenant_id, jurisdiction_code, service_type)
  WHERE is_active = true;
