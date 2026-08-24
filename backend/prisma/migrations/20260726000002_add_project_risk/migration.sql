-- Project risk register (ADR-065) — pulled forward from post-MVP by PO decision 2026-07-25.
-- Source: ADR-065; docs/specifications/11-database-schema §11 (ProjectRisk); §14 (/projects/{id}/risks).
-- A structured, human-owned risk log per project: likelihood × impact (5×5) scoring, category,
-- mitigation, owner, status, and a source flag distinguishing manual entries from AI-suggested ones
-- (the Layer B AI delay-risk model — a later cycle — will create source = 'AI_SUGGESTED' for triage).
-- risk_score is a GENERATED column so likelihood × impact can never drift from its inputs.
-- Backward-compatible: new table only (QM-9). RLS + app_user grants (Phase 16 standard).
-- Rollback: prisma/rollbacks/20260726000002_add_project_risk.rollback.sql

-- ─── project_risk (§11 ProjectRisk; ADR-065) ─────────────────────────────────────────────────
CREATE TABLE projects.project_risk (
  risk_id      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID         NOT NULL REFERENCES projects.projects (project_id) ON DELETE CASCADE,
  tenant_id    UUID         NOT NULL,
  title        VARCHAR(255) NOT NULL,
  description  TEXT,
  category     VARCHAR(10)  NOT NULL
                 CHECK (category IN ('SAFETY', 'FINANCIAL', 'SCHEDULE', 'TECHNICAL', 'EXTERNAL', 'OTHER')),
  likelihood   SMALLINT     NOT NULL CHECK (likelihood BETWEEN 1 AND 5),
  impact       SMALLINT     NOT NULL CHECK (impact BETWEEN 1 AND 5),
  -- 1–25 heat-map band; STORED so it is queryable and never inconsistent with likelihood/impact.
  risk_score   SMALLINT     GENERATED ALWAYS AS (likelihood * impact) STORED,
  mitigation   TEXT,
  owner        UUID,
  status       VARCHAR(11)  NOT NULL DEFAULT 'OPEN'
                 CHECK (status IN ('OPEN', 'MITIGATING', 'CLOSED', 'ACCEPTED')),
  source       VARCHAR(12)  NOT NULL DEFAULT 'MANUAL'
                 CHECK (source IN ('MANUAL', 'AI_SUGGESTED')),
  created_by   UUID         NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_project_risk_tenant_project ON projects.project_risk (tenant_id, project_id);

-- ─── RLS: tenant isolation (Phase 16 standard policy) ────────────────────────────────────────
ALTER TABLE projects.project_risk ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.project_risk FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenant_isolation ON projects.project_risk;
CREATE POLICY rls_tenant_isolation ON projects.project_risk
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid);

-- ─── Grants: app_user needs table privileges (RLS still restricts rows per tenant) ────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON projects.project_risk TO app_user;
  END IF;
END $$;
