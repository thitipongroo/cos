-- Rollback for: 20260608000004_phase16_rls_policies/migration.sql
-- Reverses: all RLS policies and ENABLE ROW LEVEL SECURITY on tenant-scoped tables.
-- Source: spec §9.7.1 + §9.7.3 — rollback must DROP POLICY and DISABLE ROW LEVEL SECURITY.
--
-- Safe to run multiple times (idempotent — uses IF EXISTS).
-- Does NOT drop app_user or system_admin_role (created IF NOT EXISTS; may predate this migration).

-- ─── Revoke grants from app_user ─────────────────────────────────────────────
DO $$ DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['projects','boq','procurement','finance','site_ops','files','ai','notifications','platform']
  LOOP
    EXECUTE format('REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I FROM app_user', s);
    EXECUTE format('REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I FROM app_user', s);
    EXECUTE format('REVOKE USAGE ON SCHEMA %I FROM app_user', s);
  END LOOP;
END $$;

-- ─── Drop rls_tenant_isolation on all tenant-scoped tables ───────────────────
DO $$ DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT schemaname, tablename
    FROM information_schema.columns
    WHERE column_name = 'tenant_id'
      AND table_schema IN ('projects', 'boq', 'procurement', 'finance', 'site_ops',
                           'files', 'ai', 'notifications', 'platform')
    GROUP BY schemaname, tablename
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS rls_tenant_isolation ON %I.%I',
      t.schemaname, t.tablename
    );
    EXECUTE format('ALTER TABLE %I.%I DISABLE ROW LEVEL SECURITY', t.schemaname, t.tablename);
  END LOOP;
END $$;

-- ─── platform.audit_logs ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS rls_audit_select ON platform.audit_logs;
DROP POLICY IF EXISTS rls_audit_insert ON platform.audit_logs;
ALTER TABLE platform.audit_logs DISABLE ROW LEVEL SECURITY;

-- ─── platform.tenants ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS rls_tenants_read ON platform.tenants;
ALTER TABLE platform.tenants DISABLE ROW LEVEL SECURITY;

-- ─── platform.users ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS rls_users_tenant ON platform.users;
ALTER TABLE platform.users DISABLE ROW LEVEL SECURITY;

-- ─── platform.tenant_memberships ─────────────────────────────────────────────
DROP POLICY IF EXISTS rls_tenant_memberships ON platform.tenant_memberships;
ALTER TABLE platform.tenant_memberships DISABLE ROW LEVEL SECURITY;
