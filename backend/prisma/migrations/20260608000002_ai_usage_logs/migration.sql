-- Phase 11: AI Foundation — ai.ai_usage_logs
-- Token usage tracking for every LLM call through the AI Gateway.
-- Schema: ai (see docs/specifications/11-database-schema.md §11.0 Schema Registry)
-- Source: context/00_master_construction_os.md §Phase 11 Token Tracking Schema

CREATE SCHEMA IF NOT EXISTS ai;

CREATE TABLE ai.ai_usage_logs (
  log_id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID         NOT NULL,
  service_caller     VARCHAR(100) NOT NULL,
  template_name      VARCHAR(255),
  model_used         VARCHAR(100) NOT NULL,
  prompt_tokens      INTEGER      NOT NULL,
  completion_tokens  INTEGER      NOT NULL,
  total_tokens       INTEGER      NOT NULL,
  latency_ms         INTEGER,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX ai_usage_logs_tenant_created_idx
  ON ai.ai_usage_logs (tenant_id, created_at DESC);

-- RLS: tenant isolation
ALTER TABLE ai.ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.ai_usage_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON ai.ai_usage_logs
  AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);
