-- Consolidate withholding-tax rates onto finance.wht_rules, and give it the RLS §7.7 requires.
--
-- WHAT WAS WRONG
-- --------------
-- Two wht_rules tables existed, in two schemas, and the documentation pointed at the one nothing
-- reads.
--
--   procurement.wht_rules  — created by 20260604000002_procurement_service as an unqualified table,
--                            moved into `procurement` by the 2026-06-05 refactor and given RLS.
--                            Columns: jurisdiction / vendor_type / rate. No is_active.
--   finance.wht_rules      — created four days later by 20260608000001_wht_rules_payment_ref, whose
--                            header calls itself "additive". Columns: jurisdiction_code /
--                            service_type / rate / is_active.
--
-- `13-product-architecture` §13.3 is the authority on this table, and it names `jurisdiction_code`,
-- `service_type`, `rate` and `is_active` — the finance shape exactly. The procurement table predates
-- that section and diverges from it in three of four column names.
--
-- Only finance.wht_rules is read: FinanceRepository.findWhtRule → WhtService.calculate. Nothing in
-- the codebase reads or writes procurement.wht_rules. But four places tell a reader it is the
-- authoritative one — docs/api/procurement.openapi.yaml, the vendors.category column comment added
-- by 20260810000001, vendor-classification.ts and its spec — so a TENANT_ADMIN configuring a
-- jurisdiction where the documentation says to would have had no effect on the tax that gets
-- computed.
--
-- Product-owner decision 2026-08-22: keep finance, drop procurement, correct the four references.
--
-- TWO OTHER THINGS THIS FIXES
-- ---------------------------
-- 1. finance.wht_rules was created with NO row-level security. It carries tenant_id and is therefore
--    tenant-scoped, so §7.7 makes RLS mandatory — and 20260623000001 grants app_user SELECT on every
--    table in the finance schema, so the table was readable across tenants at the database level.
--    There is no live leak: findWhtRule spells `tenant_id = $1` in the query. But that predicate is
--    what §7.7 calls SECONDARY defence-in-depth, and here it was doing the primary's job alone.
--
-- 2. §13.3 says the Thailand defaults are "pre-seeded at tenant provisioning", and 20260608000001's
--    own comment repeats it — but nothing anywhere seeded them. WhtService.calculate throws
--    NotFoundException when no rule matches, so withholding tax could not be computed for any
--    tenant. The backfill below gives every existing tenant the two documented Thai rates; new
--    tenants get them from TenantService.createTenant in the same change.
--
-- Rollback: rollbacks/20260822000001_wht_rules_consolidate.rollback.sql

-- ─── 1. RLS on finance.wht_rules (§7.7) ──────────────────────────────────────
-- ENABLE and FORCE together, so the table owner cannot bypass it either.

ALTER TABLE finance.wht_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.wht_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenant_isolation ON finance.wht_rules;
CREATE POLICY rls_tenant_isolation ON finance.wht_rules
  AS PERMISSIVE
  FOR ALL
  TO app_user
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid);

-- ─── 2. Carry any rows across before dropping the source ─────────────────────
-- Column mapping: jurisdiction → jurisdiction_code, vendor_type → service_type. procurement's table
-- has no is_active, so every carried row lands active — which is what it meant there, since the
-- reader had no way to deactivate one.
--
-- ON CONFLICT DO NOTHING against wht_rules_unique (tenant_id, jurisdiction_code, service_type):
-- where both tables already hold the same key, finance wins, because finance is the row the running
-- system has been using. Verified against PostgreSQL: a TENANT_ADMIN's 4.25 override survived a
-- procurement row of 99.00 for the same key.
--
-- Guarded by to_regclass so this migration is safe to run against a database provisioned after the
-- drop — a fresh environment never had procurement.wht_rules.

DO $$
BEGIN
  IF to_regclass('procurement.wht_rules') IS NOT NULL THEN
    INSERT INTO finance.wht_rules (tenant_id, jurisdiction_code, service_type, rate, is_active)
    SELECT tenant_id, jurisdiction, vendor_type, rate, true
    FROM procurement.wht_rules
    ON CONFLICT ON CONSTRAINT wht_rules_unique DO NOTHING;

    DROP POLICY IF EXISTS tenant_isolation ON procurement.wht_rules;
    DROP TABLE procurement.wht_rules;
  END IF;
END $$;

-- ─── 3. Backfill the Thailand defaults (§13.3) ───────────────────────────────
-- 3% services, 5% rent — the two statutory rates §13.3 tabulates. Seeded for every existing tenant;
-- a tenant operating outside Thailand simply never looks up jurisdiction TH.
--
-- Idempotent through the same unique constraint: a tenant that already carries a TH/services rate
-- keeps the rate it has, including one a TENANT_ADMIN has already overridden.

INSERT INTO finance.wht_rules (tenant_id, jurisdiction_code, service_type, rate, is_active)
SELECT t.tenant_id, 'TH', d.service_type, d.rate, true
FROM platform.tenants t
CROSS JOIN (VALUES ('services', 3.00), ('rent', 5.00)) AS d(service_type, rate)
ON CONFLICT ON CONSTRAINT wht_rules_unique DO NOTHING;

-- ─── 4. Correct the vendors.category comment ─────────────────────────────────
-- 20260810000001 set this comment pointing at procurement.wht_rules.vendor_type, which no longer
-- exists. Restated here rather than by editing that migration: an applied migration's SQL must not
-- change, or its checksum drifts against _prisma_migrations.

COMMENT ON COLUMN procurement.vendors.category IS
  'INTERNAL — what the vendor supplies, for directory browsing: MATERIALS | LOGISTICS | SERVICES | EQUIPMENT. NULL = uncategorised. NOT a tax classification (see finance.wht_rules.service_type).';
