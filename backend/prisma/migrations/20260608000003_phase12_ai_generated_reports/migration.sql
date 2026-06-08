-- Phase 12: AI Report Assistant — ai.ai_generated_reports
-- Persists every AI-generated report for history and audit.
-- Schema: ai (see docs/specifications/11-database-schema.md §11.0)
-- Source: context/00_master_construction_os.md §Phase 12 Orchestration

CREATE TYPE ai.report_type_enum AS ENUM (
    'SITE_SUMMARY',
    'PROCUREMENT_SUMMARY',
    'EXECUTIVE_SUMMARY',
    'DELAY_RISK'
);

CREATE TABLE ai.ai_generated_reports (
    report_id     UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID                  NOT NULL,
    project_id    UUID                  NOT NULL,
    report_type   ai.report_type_enum   NOT NULL,
    content       JSONB                 NOT NULL,
    confidence    DECIMAL(4,3),
    model_used    VARCHAR(100)          NOT NULL,
    tokens_used   INTEGER               NOT NULL,
    generated_at  TIMESTAMPTZ           NOT NULL DEFAULT now(),
    generated_by  UUID
);

CREATE INDEX ai_generated_reports_project_idx
    ON ai.ai_generated_reports (project_id, report_type, generated_at DESC);

CREATE INDEX ai_generated_reports_tenant_idx
    ON ai.ai_generated_reports (tenant_id, generated_at DESC);

-- RLS: tenant isolation
ALTER TABLE ai.ai_generated_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.ai_generated_reports FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON ai.ai_generated_reports
    AS RESTRICTIVE
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);
