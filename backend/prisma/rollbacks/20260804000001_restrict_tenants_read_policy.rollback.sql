-- Rollback for 20260804000001_restrict_tenants_read_policy (QM-9).
--
-- Restores the phase-16 policy exactly as 20260608000004_rls_policies created it.
--
-- WARNING: applying this rollback re-opens the exposure the migration closed — app_user regains SELECT
-- on every row of platform.tenants, including each ENTERPRISE tenant's `dedicated_db_url` connection
-- string and its embedded credentials. Only run it if a cross-tenant app_user read of this table turns
-- out to be load-bearing somewhere outside backend/src; the fix in that case is to give that caller the
-- privileged DATABASE_URL client, not to widen the policy again.

DROP POLICY IF EXISTS rls_tenants_read ON platform.tenants;

CREATE POLICY rls_tenants_read ON platform.tenants
  AS PERMISSIVE
  FOR SELECT
  TO app_user
  USING (true);
