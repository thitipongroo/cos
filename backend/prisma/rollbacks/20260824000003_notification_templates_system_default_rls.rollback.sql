-- Rollback for 20260824000003_notification_templates_system_default_rls.
-- Returns notification_templates to the canonical single-arm policy created by
-- 20260623000002_consolidate_rls_single_permissive. NOTE: doing so re-hides every system-default
-- template from app_user and stops all notification delivery — this rollback exists for symmetry,
-- not because reverting is safe.
DROP POLICY IF EXISTS rls_tenant_isolation ON notifications.notification_templates;

CREATE POLICY rls_tenant_isolation ON notifications.notification_templates
  AS PERMISSIVE
  FOR ALL
  TO app_user
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid);
