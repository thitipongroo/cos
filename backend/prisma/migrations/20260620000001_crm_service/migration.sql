-- CRM Service: Lead → Opportunity → Customer pipeline (§11.2 / §11.3, §14 CRM APIs, §20.7.10).
-- Source: §21.6 (CRM schema from Day 1) — implemented now that the CRM UI is in scope (ADR-029).
--
-- Customer is NOT created here: it already exists as finance.customers (built in the AR Billing
-- increment, ADR-024). The opportunity "convert" action writes a finance.customers row. This
-- migration adds the upstream pipeline: leads, opportunities, contacts.
--
-- Status enums are VARCHAR + CHECK (§11 lists no values — chosen per ADR-029). Every record carries
-- created_by / created_at / updated_at / deleted_at (soft delete, §11.4). RLS per §Phase 16.

CREATE SCHEMA IF NOT EXISTS crm;

-- ─── crm.leads (§11.2) ───────────────────────────────────────────────────────

CREATE TABLE crm.leads (
  lead_id      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID         NOT NULL,
  contact_name VARCHAR(255),
  company      VARCHAR(255),
  status       VARCHAR(20)  NOT NULL DEFAULT 'NEW'
                 CHECK (status IN ('NEW', 'QUALIFIED', 'DISQUALIFIED')),
  source       VARCHAR(64),
  assigned_to  UUID,
  created_by   UUID,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

CREATE INDEX idx_leads_tenant ON crm.leads (tenant_id);

-- ─── crm.opportunities (§11.2) ───────────────────────────────────────────────

CREATE TABLE crm.opportunities (
  opportunity_id      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID          NOT NULL,
  lead_id             UUID          NOT NULL REFERENCES crm.leads (lead_id),
  title               VARCHAR(255)  NOT NULL,
  value               DECIMAL(19,4),
  status              VARCHAR(20)   NOT NULL DEFAULT 'OPEN'
                        CHECK (status IN ('OPEN', 'WON', 'LOST')),
  expected_close_date DATE,
  assigned_to         UUID,
  created_by          UUID,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_opportunities_tenant ON crm.opportunities (tenant_id);
CREATE INDEX idx_opportunities_lead ON crm.opportunities (lead_id);

-- ─── crm.contacts (§11.2) ────────────────────────────────────────────────────

CREATE TABLE crm.contacts (
  contact_id UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID         NOT NULL,
  lead_id    UUID         NOT NULL REFERENCES crm.leads (lead_id),
  name       VARCHAR(255) NOT NULL,
  email      VARCHAR(255),
  phone      VARCHAR(50),
  role       VARCHAR(64),
  created_by UUID,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_contacts_lead ON crm.contacts (lead_id);

-- ─── RLS: tenant isolation (replicate §Phase 16 standard policy) ──────────────

DO $$ DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['leads', 'opportunities', 'contacts']
  LOOP
    EXECUTE format('ALTER TABLE crm.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE crm.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS rls_tenant_isolation ON crm.%I', t);
    EXECUTE format($p$
      CREATE POLICY rls_tenant_isolation ON crm.%I
        AS PERMISSIVE FOR ALL TO app_user
        USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid)
    $p$, t);
  END LOOP;
END $$;
