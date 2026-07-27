-- AI token metering (§26 pricing — AI metered per tenant, input + output tokens, monthly quota;
-- §22.10 COST-001 per-tenant/model token cap; §31.3 "AI token budget near limit" at >80% of quota).
-- The LLM gateway records consumption here per (tenant, billing month, model); GET /ai/usage sums the
-- current month against the plan quota (STARTER 500K / PROFESSIONAL 5M / ENTERPRISE uncapped, §26) for
-- the Tenant Admin home widget. Billing month = UTC calendar month (period_month = its first day).
--
-- Backward-compatible: new schema + table only (QM-9). RLS + app_user grants inline (Phase 16 standard;
-- the 20260608000004_rls_policies grant/RLS loop is a one-time snapshot — new tables wire their own).
-- Rollback: prisma/rollbacks/20260727000001_ai_token_usage.rollback.sql

CREATE SCHEMA IF NOT EXISTS ai;

-- ─── ai.token_usage (§26 metering) ───────────────────────────────────────────────────────────
-- One accumulating row per (tenant, billing month, model). The gateway upserts, adding tokens.
CREATE TABLE ai.token_usage (
  usage_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL,
  period_month  DATE        NOT NULL,                 -- first day of the UTC billing month
  model         VARCHAR(64) NOT NULL,                 -- provider model id (gpt-4o, gpt-4o-mini, whisper-1)
  input_tokens  BIGINT      NOT NULL DEFAULT 0 CHECK (input_tokens  >= 0),
  output_tokens BIGINT      NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_ai_token_usage_tenant_period_model UNIQUE (tenant_id, period_month, model)
);
CREATE INDEX idx_ai_token_usage_tenant_period ON ai.token_usage (tenant_id, period_month);

-- ─── RLS: tenant isolation (Phase 16 standard policy) ────────────────────────────────────────
ALTER TABLE ai.token_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.token_usage FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenant_isolation ON ai.token_usage;
CREATE POLICY rls_tenant_isolation ON ai.token_usage
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid);

-- ─── Grants: app_user needs schema USAGE + table privileges (RLS still restricts rows per tenant) ──
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT USAGE ON SCHEMA ai TO app_user;
    GRANT SELECT, INSERT, UPDATE ON ai.token_usage TO app_user;
    ALTER DEFAULT PRIVILEGES IN SCHEMA ai GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
  END IF;
END $$;
