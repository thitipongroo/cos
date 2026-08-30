-- Rollback for 20260822000001_normalize_rls_tenant_isolation_policies.
--
-- Restores the four policies to EXACTLY the definitions the forward migration replaced, as read
-- from pg_policies on a migrated database before the change:
--
--   files.retention_policies      CREATE POLICY tenant_isolation ... AS RESTRICTIVE
--                                 USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid)
--                                 -- no TO clause (defaults to public), no WITH CHECK
--   finance.boq_line_snapshots    rls_tenant_isolation, PERMISSIVE, TO app_user, USING + WITH CHECK
--   finance.contract_signatures   without the NULLIF guard
--   finance.contract_sign_tokens  ditto
--
-- WARNING — rolling back re-introduces a KNOWN DEFECT: files.retention_policies goes back to a lone
-- RESTRICTIVE policy, which denies app_user every row on that table. Only run this if the forward
-- migration must be undone for an unrelated reason.

DROP POLICY IF EXISTS rls_tenant_isolation ON files.retention_policies;
CREATE POLICY tenant_isolation ON files.retention_policies AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

DROP POLICY IF EXISTS rls_tenant_isolation ON finance.boq_line_snapshots;
CREATE POLICY rls_tenant_isolation ON finance.boq_line_snapshots
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

DROP POLICY IF EXISTS rls_tenant_isolation ON finance.contract_signatures;
CREATE POLICY rls_tenant_isolation ON finance.contract_signatures
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

DROP POLICY IF EXISTS rls_tenant_isolation ON finance.contract_sign_tokens;
CREATE POLICY rls_tenant_isolation ON finance.contract_sign_tokens
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);
