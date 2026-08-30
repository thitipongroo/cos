-- Normalize four tenant-isolation policies that drifted from the canonical form.
--
-- BACKGROUND
-- ----------
-- 20260623000002_consolidate_rls_single_permissive normalized every domain table to exactly ONE
-- policy: `rls_tenant_isolation`, AS PERMISSIVE, FOR ALL, TO app_user, NULLIF-hardened, WITH CHECK
-- (ADR-031; context/00_master_construction_os.md §Phase 2 "Implementation"). Tables created AFTER
-- that migration were written by hand and four of them missed part of the form. Verified against a
-- migrated database via pg_policies, not by reading the migration files — earlier migrations are
-- superseded, so their text does not describe the live schema:
--
--   files.retention_policies        policy `tenant_isolation`, AS RESTRICTIVE, TO public,
--                                   no NULLIF, no WITH CHECK   (20260706000003)
--   finance.boq_line_snapshots      correct in every respect EXCEPT the NULLIF guard (20260721000003)
--   finance.contract_signatures     same                                            (20260721000001)
--   finance.contract_sign_tokens    same                                            (20260721000005)
--
-- WHY THIS MATTERS
-- ----------------
-- files.retention_policies carried a LONE RESTRICTIVE policy. RESTRICTIVE narrows, it never grants,
-- so with no PERMISSIVE policy beside it the table is deny-all for app_user: every SELECT returns
-- zero rows and every INSERT fails. The master spec warns about exactly this shape — "NOT
-- RESTRICTIVE: a lone RESTRICTIVE policy grants no access" — and the consolidation migration says
-- the same. The retention / legal-hold feature therefore cannot have been working through app_user.
--
-- The missing NULLIF is milder but real: `current_setting('app.current_tenant_id', TRUE)` returns
-- NULL when unset (fine), but an EMPTY STRING casts as ''::uuid and raises 22P02 instead of
-- returning zero rows. NULLIF turns that into a clean no-match.
--
-- BACKWARD COMPATIBILITY (QM-9)
-- -----------------------------
-- Widening only; no schema change, no data change, nothing removed.
--   * files.retention_policies: app_user goes from "no rows at all" to "its own tenant's rows".
--     Nothing that worked before stops working — the owner/superuser path bypasses RLS either way.
--   * the three finance tables: identical behaviour except that an empty GUC now yields zero rows
--     instead of a cast error.
-- Rollback: prisma/rollbacks/20260822000001_normalize_rls_tenant_isolation_policies.rollback.sql
--
-- Idempotent: drops every existing policy on each table, then creates the single canonical one.

DO $$
DECLARE
  t record;
  p record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('files',   'retention_policies'),
      ('finance', 'boq_line_snapshots'),
      ('finance', 'contract_signatures'),
      ('finance', 'contract_sign_tokens')
    ) AS v(schemaname, tablename)
  LOOP
    -- Skip a table that is not present (a database migrated only part-way).
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = t.schemaname AND table_name = t.tablename
    );

    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t.schemaname, t.tablename);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', t.schemaname, t.tablename);

    FOR p IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = t.schemaname AND tablename = t.tablename
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, t.schemaname, t.tablename);
    END LOOP;

    EXECUTE format($pol$
      CREATE POLICY rls_tenant_isolation ON %I.%I
        AS PERMISSIVE
        FOR ALL
        TO app_user
        USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid)
    $pol$, t.schemaname, t.tablename);
  END LOOP;
END $$;
