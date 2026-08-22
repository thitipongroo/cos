-- Rollback: 20260822000001_wht_rules_consolidate
--
-- Recreates procurement.wht_rules with its original shape and policy, copies the rates back, and
-- removes the RLS this migration added to finance.wht_rules.
--
-- WHAT THIS COSTS, AND WHY IT IS NOT SYMMETRIC
-- --------------------------------------------
-- The forward migration merged two tables into one. Reversing it cannot tell which rows came from
-- which side: a row that existed in both was deduplicated by the unique constraint, and the
-- Thailand backfill added rows that never existed in either. So this rollback copies EVERY current
-- finance.wht_rules row back into procurement.wht_rules rather than trying to reconstruct the
-- original split. The result is a superset of what procurement held before — which is the safe
-- direction, since procurement.wht_rules has no reader and an extra row there changes no behaviour.
--
-- finance.wht_rules itself is left populated. Dropping the Thailand defaults would take withholding
-- tax back to throwing NotFoundException for every tenant, and a rollback that breaks a working
-- calculation is worse than one that leaves data in place. If the defaults must go, delete them
-- deliberately:
--   DELETE FROM finance.wht_rules WHERE jurisdiction_code = 'TH' AND service_type IN ('services','rent');
--
-- Removing the RLS policy is a REAL loss of isolation, not a formality: 20260623000001 grants
-- app_user SELECT on every table in the finance schema, so without the policy the only thing
-- keeping one tenant's rates away from another is the `tenant_id = $1` predicate in
-- FinanceRepository.findWhtRule. Do not run this rollback on an environment carrying more than one
-- tenant's data unless that predicate has been re-verified.

-- ─── 1. Recreate procurement.wht_rules in its original shape ─────────────────

CREATE TABLE IF NOT EXISTS procurement.wht_rules (
  rule_id         UUID          NOT NULL DEFAULT gen_random_uuid(),
  tenant_id       UUID          NOT NULL,
  jurisdiction    VARCHAR(10)   NOT NULL,
  vendor_type     VARCHAR(50)   NOT NULL,
  rate            DECIMAL(5,2)  NOT NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT wht_rules_pkey PRIMARY KEY (rule_id),
  CONSTRAINT uq_wht_tenant_jurisdiction_type UNIQUE (tenant_id, jurisdiction, vendor_type)
);

ALTER TABLE procurement.wht_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.wht_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON procurement.wht_rules;
CREATE POLICY tenant_isolation ON procurement.wht_rules AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- ─── 2. Copy the rates back ──────────────────────────────────────────────────

INSERT INTO procurement.wht_rules (tenant_id, jurisdiction, vendor_type, rate)
SELECT tenant_id, jurisdiction_code, service_type, rate
FROM finance.wht_rules
ON CONFLICT ON CONSTRAINT uq_wht_tenant_jurisdiction_type DO NOTHING;

-- ─── 3. Remove the RLS this migration added ──────────────────────────────────

DROP POLICY IF EXISTS rls_tenant_isolation ON finance.wht_rules;
ALTER TABLE finance.wht_rules NO FORCE ROW LEVEL SECURITY;
ALTER TABLE finance.wht_rules DISABLE ROW LEVEL SECURITY;
