-- Vendor Portal: external vendor network identity + trading relationships + RFQ invitations.
-- Source: ADR-030 (Vendor Portal brought into MVP). §11.1 / §11.2, §05 §5.4.3, §06 §6.8b.
--
-- platform.vendor_identities + platform.vendor_trading_relationships are CROSS-TENANT and
-- RLS-exempt (platform schema, same as platform.users) — a vendor is a network participant, not a
-- tenant member. procurement.rfq_invitations IS tenant-scoped (RLS) and holds the Tier-1 magic-link
-- token as token_hash only (never the raw token; 5-15 min expiry per §05 §5.4.3).
--
-- The magic-link token is a signed payload carrying tenant_id + invitation_id, so the verifier sets
-- the tenant context BEFORE the RLS-protected rfq_invitations lookup.

-- ─── platform.vendor_identities (cross-tenant network identity; no RLS) ───────

CREATE TABLE platform.vendor_identities (
  vendor_identity_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email              VARCHAR(255) NOT NULL UNIQUE,
  display_name       VARCHAR(255) NOT NULL,
  keycloak_user_id   VARCHAR(255) UNIQUE,
  is_active          BOOLEAN      NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ─── platform.vendor_trading_relationships (vendor ↔ tenant ↔ procurement.vendors) ──

CREATE TABLE platform.vendor_trading_relationships (
  relationship_id    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_identity_id UUID         NOT NULL REFERENCES platform.vendor_identities (vendor_identity_id),
  tenant_id          UUID         NOT NULL REFERENCES platform.tenants (tenant_id),
  vendor_id          UUID         NOT NULL REFERENCES procurement.vendors (vendor_id),
  status             VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE'
                       CHECK (status IN ('ACTIVE', 'REVOKED')),
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_vtr_tenant_vendor_identity UNIQUE (tenant_id, vendor_identity_id)
);

CREATE INDEX idx_vtr_vendor_identity ON platform.vendor_trading_relationships (vendor_identity_id);

-- platform.* tables are cross-tenant and RLS-exempt (§11.0; same as platform.users).

-- ─── procurement.rfq_invitations (tenant-scoped, RLS; Tier-1 magic-link) ──────

CREATE TABLE procurement.rfq_invitations (
  invitation_id      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID         NOT NULL,
  rfq_id             UUID         NOT NULL REFERENCES procurement.rfqs (rfq_id),
  vendor_identity_id UUID         REFERENCES platform.vendor_identities (vendor_identity_id),
  invited_email      VARCHAR(255) NOT NULL,
  token_hash         VARCHAR(255) NOT NULL UNIQUE,
  expires_at         TIMESTAMPTZ  NOT NULL,
  status             VARCHAR(20)  NOT NULL DEFAULT 'PENDING'
                       CHECK (status IN ('PENDING', 'RESPONDED', 'EXPIRED')),
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_rfq_invitations_tenant ON procurement.rfq_invitations (tenant_id);
CREATE INDEX idx_rfq_invitations_token ON procurement.rfq_invitations (token_hash);
CREATE INDEX idx_rfq_invitations_rfq ON procurement.rfq_invitations (rfq_id);

-- RLS: tenant isolation (replicate §Phase 16 standard policy)
ALTER TABLE procurement.rfq_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.rfq_invitations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenant_isolation ON procurement.rfq_invitations;
CREATE POLICY rls_tenant_isolation ON procurement.rfq_invitations
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- ─── GRANT to app_user ───────────────────────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT USAGE ON SCHEMA platform TO app_user;
    GRANT SELECT, INSERT, UPDATE ON platform.vendor_identities TO app_user;
    GRANT SELECT, INSERT, UPDATE ON platform.vendor_trading_relationships TO app_user;
    GRANT SELECT, INSERT, UPDATE ON procurement.rfq_invitations TO app_user;
  END IF;
END $$;
