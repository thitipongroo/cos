-- Phase 2 (Tenant Settings): per-tenant configurable settings for TENANT_ADMIN (§20.7.8).
-- Source: §20.7.8 (/settings/tenant — variance thresholds, retention %, LINE channel token,
--         notification prefs), §19.4 (LINE Channel Access Token lives in tenant settings).
--
-- One row per tenant (tenant_id PK). The schema is derived from the §20.7.8 settings list
-- (no TenantSettings entity exists in §11 — ADR-028). Lives in `platform`; RLS keyed by tenant_id.

CREATE TABLE platform.tenant_settings (
  tenant_id                UUID          PRIMARY KEY,
  variance_alert_threshold DECIMAL(5, 2) NOT NULL DEFAULT 10.00,
  retention_percentage     DECIMAL(5, 2) NOT NULL DEFAULT 5.00,
  line_channel_token       VARCHAR(512),
  notifications_enabled    BOOLEAN       NOT NULL DEFAULT TRUE,
  updated_at               TIMESTAMPTZ   NOT NULL DEFAULT now()
);

ALTER TABLE platform.tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.tenant_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenant_isolation ON platform.tenant_settings;
CREATE POLICY rls_tenant_isolation ON platform.tenant_settings
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);
