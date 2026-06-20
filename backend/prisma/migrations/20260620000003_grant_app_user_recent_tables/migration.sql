-- Patch: grant app_user access to tables created by migrations 20260611000001 .. 20260620000001.
--
-- Those six migrations (material_consumptions, ar_billing, tasks_permits, safety_incidents,
-- tenant_settings, crm_service) created tables + RLS policies (POLICY ... TO app_user) but omitted
-- the GRANT block that the standard pattern requires (see phase21/phase22 migrations). Without it,
-- the runtime `app_user` role has no table privileges and every query against those tables fails.
-- This patch adds only the missing grants — no schema or data change.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    -- crm is a new schema (20260620000001) — app_user needs USAGE on it
    GRANT USAGE ON SCHEMA crm TO app_user;

    -- tables (SELECT, INSERT, UPDATE — soft-delete model per §11.4, no hard DELETE)
    GRANT SELECT, INSERT, UPDATE ON site_ops.material_consumptions TO app_user;
    GRANT SELECT, INSERT, UPDATE ON finance.customers             TO app_user;
    GRANT SELECT, INSERT, UPDATE ON finance.contracts             TO app_user;
    GRANT SELECT, INSERT, UPDATE ON finance.billings              TO app_user;
    GRANT SELECT, INSERT, UPDATE ON finance.ar_receipts           TO app_user;
    GRANT SELECT, INSERT, UPDATE ON projects.tasks                TO app_user;
    GRANT SELECT, INSERT, UPDATE ON site_ops.permits              TO app_user;
    GRANT SELECT, INSERT, UPDATE ON site_ops.incidents            TO app_user;
    GRANT SELECT, INSERT, UPDATE ON platform.tenant_settings      TO app_user;
    GRANT SELECT, INSERT, UPDATE ON crm.leads                     TO app_user;
    GRANT SELECT, INSERT, UPDATE ON crm.opportunities             TO app_user;
    GRANT SELECT, INSERT, UPDATE ON crm.contacts                  TO app_user;
  END IF;
END $$;
