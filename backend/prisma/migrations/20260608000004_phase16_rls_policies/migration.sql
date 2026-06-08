-- Phase 16: PostgreSQL Row-Level Security (RLS) policies for all tenant-scoped tables.
-- Source: spec §Phase 16 + §7.7 (tenant isolation PRIMARY enforcement at DB level)
--
-- RLS is the PRIMARY tenant isolation mechanism. Application-layer WHERE tenant_id = $1
-- is SECONDARY defense-in-depth (see spec §7.7).
--
-- Policy USING clause: tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid
-- The application sets this via: SET LOCAL app.current_tenant_id = '<uuid>';
-- (wrapped in each Prisma transaction via middleware)
--
-- app_user role: the PostgreSQL role used by the application (Prisma connection pool).
-- SYSTEM_ADMIN role: bypasses RLS (used for maintenance operations only).

-- ─── Create app role if not exists ───────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'system_admin_role') THEN
    CREATE ROLE system_admin_role BYPASSRLS;
  END IF;
END $$;

-- ─── Helper: enable RLS + standard tenant-isolation policy ───────────────────
-- Applied to every table with a tenant_id column.
-- Policy name: rls_tenant_isolation
-- SELECT/INSERT/UPDATE/DELETE all restricted by tenant context.

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
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t.schemaname, t.tablename);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', t.schemaname, t.tablename);

    -- Drop existing policy to allow re-entrant migrations
    EXECUTE format(
      'DROP POLICY IF EXISTS rls_tenant_isolation ON %I.%I',
      t.schemaname, t.tablename
    );

    EXECUTE format($$
      CREATE POLICY rls_tenant_isolation ON %I.%I
        AS PERMISSIVE
        FOR ALL
        TO app_user
        USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid)
    $$, t.schemaname, t.tablename);
  END LOOP;
END $$;

-- ─── audit_logs: immutable — deny UPDATE and DELETE for app_user ─────────────
-- Source: spec §Phase 16 — "audit_logs table: no UPDATE or DELETE via application"
ALTER TABLE platform.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.audit_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_tenant_isolation ON platform.audit_logs;
DROP POLICY IF EXISTS rls_audit_no_update ON platform.audit_logs;
DROP POLICY IF EXISTS rls_audit_no_delete ON platform.audit_logs;

CREATE POLICY rls_audit_select ON platform.audit_logs
  AS PERMISSIVE FOR SELECT TO app_user
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

CREATE POLICY rls_audit_insert ON platform.audit_logs
  AS PERMISSIVE FOR INSERT TO app_user
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- UPDATE and DELETE on audit_logs: no policy = denied for app_user (RLS default-deny)

-- ─── platform.tenants: accessible only to system_admin_role for writes ────────
ALTER TABLE platform.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.tenants FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_tenants_read ON platform.tenants;
CREATE POLICY rls_tenants_read ON platform.tenants
  AS PERMISSIVE FOR SELECT TO app_user
  USING (true);  -- all tenants readable for lookup (cross-tenant tenant resolution)

-- ─── platform.users: users can read own tenant's records ─────────────────────
ALTER TABLE platform.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.users FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_users_tenant ON platform.users;
CREATE POLICY rls_users_tenant ON platform.users
  AS PERMISSIVE FOR ALL TO app_user
  USING (
    tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid
    OR tenant_id IS NULL  -- system users
  )
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- ─── platform.tenant_memberships ─────────────────────────────────────────────
ALTER TABLE platform.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.tenant_memberships FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_tenant_memberships ON platform.tenant_memberships;
CREATE POLICY rls_tenant_memberships ON platform.tenant_memberships
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- ─── Grant table privileges to app_user ──────────────────────────────────────
DO $$ DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['projects','boq','procurement','finance','site_ops','files','ai','notifications','platform']
  LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO app_user', s);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO app_user', s);
    EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO app_user', s);
  END LOOP;
END $$;
