-- Phase 7 (AR Billing increment): Client Billing (AR), AR Receipts, Contracts, Customers.
-- Source: spec §11 (Financials — Billing / AR Receipt / Contract / Customer),
--         §15 (Client Billing approval: Finance → PM → Executive above limit),
--         §06 (RBAC), §28 (AR/Billing module — MVP scope), §14 (finance billing + cashflow APIs).
--
-- Schema placement: customers + contracts live in the `finance` schema (the consuming domain
-- for AR Billing). No dedicated `crm` schema exists; Customer.opportunity_id is nullable so AR
-- customers may be created directly without the full CRM Lead→Opportunity pipeline (§21.6 keeps
-- CRM UI excluded). Documented in ADR-024.
--
-- Financial fields: DECIMAL(19,4) (FINANCIAL PRECISION SPEC). Enums UPPERCASE (codebase convention).

-- ─── Enums ───────────────────────────────────────────────────────────────────

CREATE TYPE finance."BillingStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID');
CREATE TYPE finance."ContractType" AS ENUM ('MAIN_CONTRACT', 'SUBCONTRACT', 'SUPPLY_AGREEMENT');

-- ─── customers (AR client) ───────────────────────────────────────────────────
-- §11 Customer. opportunity_id nullable (no CRM Opportunity table yet — ADR-024).

CREATE TABLE finance.customers (
  customer_id     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID         NOT NULL,
  opportunity_id  UUID,
  company_name    VARCHAR(255) NOT NULL,
  customer_type   VARCHAR(64),
  status          VARCHAR(32)  NOT NULL DEFAULT 'ACTIVE',
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_customers_tenant ON finance.customers (tenant_id);

-- ─── contracts (client-side + vendor-side) ───────────────────────────────────
-- §11 Contract. contract_value nullable (framework agreements); customer_id for main_contract,
-- vendor_id for subcontract/supply_agreement.

CREATE TABLE finance.contracts (
  contract_id     UUID                      PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID                      NOT NULL,
  project_id      UUID                      NOT NULL,
  contract_type   finance."ContractType"    NOT NULL,
  contract_value  DECIMAL(19,4),
  customer_id     UUID                      REFERENCES finance.customers (customer_id),
  vendor_id       UUID,
  status          VARCHAR(32)               NOT NULL DEFAULT 'ACTIVE',
  created_at      TIMESTAMPTZ               NOT NULL DEFAULT now()
);

CREATE INDEX idx_contracts_project ON finance.contracts (project_id, tenant_id);
CREATE INDEX idx_contracts_customer ON finance.contracts (customer_id);

-- ─── billings (AR — Accounts Receivable) ─────────────────────────────────────
-- §11 Financials — Billing. status DRAFT→ISSUED (approval, §15)→PAID (AR receipt recorded).

CREATE TABLE finance.billings (
  billing_id      UUID                      PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID                      NOT NULL,
  project_id      UUID                      NOT NULL,
  contract_id     UUID                      NOT NULL REFERENCES finance.contracts (contract_id),
  billing_number  VARCHAR(64)               NOT NULL,
  amount          DECIMAL(19,4)             NOT NULL,
  due_date        DATE                      NOT NULL,
  status          finance."BillingStatus"   NOT NULL DEFAULT 'DRAFT',
  issued_at       TIMESTAMPTZ,
  approved_by     UUID,
  created_at      TIMESTAMPTZ               NOT NULL DEFAULT now()
);

CREATE INDEX idx_billings_project ON finance.billings (project_id, tenant_id);
CREATE INDEX idx_billings_contract ON finance.billings (contract_id);
CREATE INDEX idx_billings_due ON finance.billings (tenant_id, due_date);

-- ─── ar_receipts (client payment received) ───────────────────────────────────
-- §11 Financials — AR Receipt. On insert, parent Billing transitions to PAID (service layer).

CREATE TABLE finance.ar_receipts (
  ar_receipt_id     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID          NOT NULL,
  project_id        UUID          NOT NULL,
  billing_id        UUID          NOT NULL REFERENCES finance.billings (billing_id),
  customer_id       UUID          NOT NULL REFERENCES finance.customers (customer_id),
  amount_received   DECIMAL(19,4) NOT NULL,
  received_date     DATE          NOT NULL,
  payment_method    VARCHAR(64),
  payment_reference VARCHAR(255),
  received_by       UUID          NOT NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_ar_receipts_billing ON finance.ar_receipts (billing_id);
CREATE INDEX idx_ar_receipts_project ON finance.ar_receipts (project_id, tenant_id);

-- ─── RLS: tenant isolation (replicate §Phase 16 standard policy) ──────────────

DO $$ DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['customers', 'contracts', 'billings', 'ar_receipts']
  LOOP
    EXECUTE format('ALTER TABLE finance.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE finance.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS rls_tenant_isolation ON finance.%I', t);
    EXECUTE format($p$
      CREATE POLICY rls_tenant_isolation ON finance.%I
        AS PERMISSIVE FOR ALL TO app_user
        USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid)
    $p$, t);
  END LOOP;
END $$;
