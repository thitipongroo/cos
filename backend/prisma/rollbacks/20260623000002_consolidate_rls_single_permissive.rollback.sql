-- Rollback: 20260623000002_consolidate_rls_single_permissive
--
-- INTENTIONALLY does NOT recreate the pre-consolidation policies.
--
-- Why a literal inverse is not provided:
--   * The pre-state was heterogeneous — three naming conventions (tenant_isolation RESTRICTIVE,
--     rls_tenant_isolation PERMISSIVE, <table>_tenant_isolation PERMISSIVE), with redundant
--     duplicates on many tables and NULLIF hardening on only part of the set. Which table had
--     which combination is not reconstructible from the schema; recreating it would be guesswork.
--   * Every legacy combination was either equivalent to or WEAKER than the single canonical
--     policy (unhardened qual, or a lone RESTRICTIVE policy that only "worked" because of a
--     redundant PERMISSIVE duplicate). Restoring a weaker state would reduce tenant isolation
--     (risk R-02) with no operational benefit.
--   * The migration is an idempotent normalization: no data change, no application contract
--     change — old code runs unchanged against the canonical policy. There is no deployment
--     scenario that requires the legacy policy shapes back.
--
-- Rollback behaviour: verify the canonical protection is still in place on every domain table
-- (fails loudly if any table is left unprotected). To remove RLS entirely, use
-- 20260608000004_rls_policies.rollback.sql — the migration that owns RLS enablement.

DO $$ DECLARE
  t record;
  missing int := 0;
BEGIN
  FOR t IN
    SELECT table_schema AS schemaname, table_name AS tablename
    FROM information_schema.columns
    WHERE column_name = 'tenant_id'
      AND table_schema IN ('ai', 'boq', 'crm', 'digital_twin', 'equipment',
                           'equipment_telemetry', 'files', 'finance', 'notifications',
                           'procurement', 'projects', 'site_ops', 'workforce',
                           'workforce_telemetry')
    GROUP BY table_schema, table_name
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = t.schemaname AND tablename = t.tablename
        AND policyname = 'rls_tenant_isolation'
    ) THEN
      RAISE WARNING 'domain table %.% has no rls_tenant_isolation policy', t.schemaname, t.tablename;
      missing := missing + 1;
    END IF;
  END LOOP;

  IF missing > 0 THEN
    RAISE EXCEPTION 'rollback verification failed: % domain table(s) unprotected — re-run 20260623000002 or restore policies before proceeding', missing;
  END IF;

  RAISE NOTICE 'canonical rls_tenant_isolation verified on all domain tables; nothing to revert';
END $$;
