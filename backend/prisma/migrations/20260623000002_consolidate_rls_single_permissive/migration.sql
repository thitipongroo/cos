-- Consolidate tenant-isolation RLS to a SINGLE permissive policy per domain table.
--
-- Background: the codebase accumulated THREE competing tenant-isolation conventions —
--   * `tenant_isolation`           AS RESTRICTIVE (early migrations: db_refactor_global_schemas,
--                                                  phase0_master_data, phase11_ai_usage, phase12_ai_reports)
--   * `rls_tenant_isolation`       AS PERMISSIVE  (phase16_rls_policies + later feature migrations)
--   * `<table>_tenant_isolation`   AS PERMISSIVE  (phase21_equipment, phase22_workforce, phase24_digital_twin),
--                                                  not NULLIF-hardened
-- so many domain tables ended up with two redundant policies, and the NULLIF hardening only
-- reached part of the PERMISSIVE set. This normalizes every domain table to exactly ONE policy.
--
-- Decision (ADR-031): use a SINGLE PERMISSIVE `rls_tenant_isolation` policy per domain table.
-- Why PERMISSIVE (not RESTRICTIVE):
--   * PERMISSIVE policies combine with OR, RESTRICTIVE with AND (PostgreSQL CREATE POLICY docs).
--   * With exactly ONE policy per table the OR/AND distinction is moot — a lone policy fully
--     governs access either way — so the simplest correct form is the default (PERMISSIVE),
--     matching AWS SaaS Factory and Crunchy Data's single-policy tenant-isolation examples.
--   * A lone RESTRICTIVE policy would deny ALL rows: RESTRICTIVE narrows but never grants, so it
--     requires a separate PERMISSIVE policy to grant access first. The spec template that said
--     `AS RESTRICTIVE` as the only policy was therefore unsafe; it only "worked" because a
--     redundant PERMISSIVE duplicate happened to grant access.
--   * The OR-widening footgun (a broad permissive lookup policy widening access) cannot occur
--     when a table has a single policy. Defence-in-depth remains: non-owner `app_user` + RLS +
--     application-layer `WHERE tenant_id`.
--
-- Scope: DOMAIN schemas only. The `platform` schema is INTENTIONALLY excluded — its tables carry
-- bespoke policies (cross-tenant `rls_tenants_read` lookup, `rls_users_tenant` incl. system users,
-- immutable `rls_audit_*`) that are a deliberate special case, not the duplication fixed here.
--
-- Idempotent: drops both legacy policy names and (re)creates the single PERMISSIVE form.

DO $$ DECLARE
  t record;
  p record;
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
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t.schemaname, t.tablename);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', t.schemaname, t.tablename);

    -- Drop EVERY existing policy on this domain table. All three legacy naming conventions
    -- (tenant_isolation, rls_tenant_isolation, <table>_tenant_isolation) are tenant-isolation
    -- policies; verified that no domain table carries a policy whose qual does not reference
    -- app.current_tenant_id, so dropping all and recreating the single canonical policy is safe.
    FOR p IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = t.schemaname AND tablename = t.tablename
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, t.schemaname, t.tablename);
    END LOOP;

    -- Single canonical policy: PERMISSIVE, NULLIF-hardened (empty/unset GUC -> NULL -> zero rows).
    -- Inner dollar-quote uses a distinct tag so it does not close the surrounding DO block.
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
