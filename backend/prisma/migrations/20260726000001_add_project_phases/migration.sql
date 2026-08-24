-- Phase 3 (amendment 2026-07-25): project phases — construction execution-stage tracking.
-- Source: ADR-070; docs/specifications/13-product-architecture §13.4 (BIM Structure Import:
--   IfcBuildingStorey → project phases → phasesCreated); §11 (Project Phase); §10.2 ontology (Phase).
-- PO decision 2026-07-25: model = first-class projects.project_phases entity (world-class WBS pattern,
--   Procore / Primavera P6). The dashboard's "current phase" is DERIVED from status/seq (ADR-070),
--   never a stored is_current flag. name is free-form (matches BIM IfcBuildingStorey; no fixed taxonomy).
-- Backward-compatible: new table only (QM-9). RLS + app_user grants applied inline (Phase 16 standard).
-- Rollback: prisma/rollbacks/20260726000001_add_project_phases.rollback.sql

-- ─── project_phases (§11 Project Phase; ADR-070) ─────────────────────────────────────────────
CREATE TABLE projects.project_phases (
  phase_id      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID         NOT NULL REFERENCES projects.projects (project_id) ON DELETE CASCADE,
  tenant_id     UUID         NOT NULL,
  seq           INTEGER      NOT NULL,
  name          VARCHAR(255) NOT NULL,
  status        VARCHAR(12)  NOT NULL DEFAULT 'NOT_STARTED'
                  CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED')),
  planned_start DATE,
  planned_end   DATE,
  actual_start  DATE,
  actual_end    DATE,
  created_by    UUID         NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- Ordering is unique per project; two phases cannot share a seq (drives ORDER BY seq determinism).
  CONSTRAINT uq_project_phases_seq UNIQUE (tenant_id, project_id, seq)
);
CREATE INDEX idx_project_phases_tenant_project ON projects.project_phases (tenant_id, project_id);

-- ─── RLS: tenant isolation (Phase 16 standard policy) ────────────────────────────────────────
ALTER TABLE projects.project_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.project_phases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenant_isolation ON projects.project_phases;
CREATE POLICY rls_tenant_isolation ON projects.project_phases
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid);

-- ─── Grants: app_user needs table privileges (RLS still restricts rows per tenant) ────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON projects.project_phases TO app_user;
  END IF;
END $$;
