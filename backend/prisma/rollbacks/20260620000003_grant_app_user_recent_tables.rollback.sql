-- Rollback: revoke the grants added by 20260620000003.
-- Note: these grants are required for the application to function — roll back only if you are also
-- rolling back the migrations that created the tables. Grants only; no schema or data change.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    REVOKE SELECT, INSERT, UPDATE ON site_ops.material_consumptions FROM app_user;
    REVOKE SELECT, INSERT, UPDATE ON finance.customers             FROM app_user;
    REVOKE SELECT, INSERT, UPDATE ON finance.contracts             FROM app_user;
    REVOKE SELECT, INSERT, UPDATE ON finance.billings              FROM app_user;
    REVOKE SELECT, INSERT, UPDATE ON finance.ar_receipts           FROM app_user;
    REVOKE SELECT, INSERT, UPDATE ON projects.tasks                FROM app_user;
    REVOKE SELECT, INSERT, UPDATE ON site_ops.permits             FROM app_user;
    REVOKE SELECT, INSERT, UPDATE ON site_ops.incidents           FROM app_user;
    REVOKE SELECT, INSERT, UPDATE ON platform.tenant_settings      FROM app_user;
    REVOKE SELECT, INSERT, UPDATE ON crm.leads                     FROM app_user;
    REVOKE SELECT, INSERT, UPDATE ON crm.opportunities             FROM app_user;
    REVOKE SELECT, INSERT, UPDATE ON crm.contacts                  FROM app_user;
    REVOKE USAGE ON SCHEMA crm FROM app_user;
  END IF;
END $$;
