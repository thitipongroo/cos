-- Phase 6 (Safety Incidents): incident reporting + task completion gate #5.
-- Source: spec §11 (Safety — Incidents), §14 (POST /safety/incidents, PATCH acknowledge),
--         §21.2 (MVP Safety scope), master Phase 6 gate #5
--         (open HIGH/CRITICAL incident linked to a task blocks completion).
--
-- Lives in the `site_ops` schema (safety is part of site operations). task_id is nullable
-- (gate #5). acknowledged_by / acknowledged_at support the acknowledge transition (§14).
-- Enums use VARCHAR + CHECK (site_ops convention). RLS replicates the §Phase 16 standard policy.

CREATE TABLE site_ops.incidents (
  incident_id     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID         NOT NULL,
  project_id      UUID         NOT NULL,
  task_id         UUID,
  incident_type   VARCHAR(64)  NOT NULL,
  severity        VARCHAR(10)  NOT NULL
                    CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  reported_by     UUID         NOT NULL,
  status          VARCHAR(15)  NOT NULL DEFAULT 'OPEN'
                    CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_incidents_project ON site_ops.incidents (project_id, tenant_id);
CREATE INDEX idx_incidents_task ON site_ops.incidents (task_id);

ALTER TABLE site_ops.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_ops.incidents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenant_isolation ON site_ops.incidents;
CREATE POLICY rls_tenant_isolation ON site_ops.incidents
  AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);
