-- Restrict platform.tenants SELECT for app_user to the caller's own tenant (security review F5a).
--
-- The phase-16 RLS migration (20260608000004_rls_policies) created:
--
--   CREATE POLICY rls_tenants_read ON platform.tenants
--     AS PERMISSIVE FOR SELECT TO app_user
--     USING (true);  -- all tenants readable for lookup (cross-tenant tenant resolution)
--
-- combined with GRANT SELECT ON ALL TABLES IN SCHEMA platform TO app_user. Together those let ANY
-- app_user connection read EVERY row of platform.tenants — including `dedicated_db_url`, which stores a
-- complete PostgreSQL connection string (credentials included) for every ENTERPRISE tenant. The RLS
-- layer that protects every other table was explicitly switched off for the one table holding secrets.
--
-- The "cross-tenant tenant resolution" the original comment cites no longer needs app_user: every
-- reader of platform.tenants in backend/src connects with the privileged DATABASE_URL client, not the
-- app role — tenant.service.ts, tenant.middleware.ts, user.service.ts, identity.service.ts,
-- utils/get-db-url.ts, strategies/keycloak-jwt.strategy.ts and notification.repository.ts
-- (`platformPrisma`). Narrowing the policy therefore removes reachable exposure without removing a
-- capability anything uses.
--
-- Same GUC predicate as every other rls_tenant_isolation policy; NULLIF maps an unset GUC to NULL so it
-- matches no row rather than every row.
--
-- Backward-compatible (QM-9): SELECT-only policy narrowing, no schema change, no data change. Old code
-- keeps working because no deployed code path reads this table as app_user.

DROP POLICY IF EXISTS rls_tenants_read ON platform.tenants;

CREATE POLICY rls_tenants_read ON platform.tenants
  AS PERMISSIVE
  FOR SELECT
  TO app_user
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid);
