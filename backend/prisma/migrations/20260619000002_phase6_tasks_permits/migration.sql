-- Phase 6 (Tasks + Permits increment): project tasks with completion gates, and permits.
-- Source: spec §11 (Tasks, Permit, Issues issue_type), §14 (/projects/{id}/tasks),
--         master Phase 6 task completion gates (inspections / issues / dependencies / permits).
--
-- Tasks live in the `projects` schema (master "projects.tasks"); permits in `site_ops`.
-- Existing site_ops.issues / site_ops.inspections gain a nullable task_id so the completion
-- gate can link them to a task (master Phase 6). issue_type (§11) classifies blocking issues.
-- Enums use VARCHAR + CHECK (site_ops convention). RLS replicates the §Phase 16 standard policy.

-- ─── projects.tasks (§11 Tasks) ──────────────────────────────────────────────

CREATE TABLE projects.tasks (
  task_id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID         NOT NULL,
  project_id       UUID         NOT NULL,
  task_name        VARCHAR(255) NOT NULL,
  work_type        VARCHAR(64)  NOT NULL DEFAULT 'construction',
  status           VARCHAR(15)  NOT NULL DEFAULT 'NOT_STARTED'
                     CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'CANCELLED')),
  floor_id         UUID,
  room_id          UUID,
  boq_item_id      UUID,
  assigned_to      UUID,
  planned_start    DATE,
  planned_end      DATE,
  actual_start     DATE,
  progress_percent INTEGER      NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  qc_status        VARCHAR(10)  NOT NULL DEFAULT 'NONE'
                     CHECK (qc_status IN ('NONE', 'QC_HOLD', 'QC_PASSED')),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_project ON projects.tasks (project_id, tenant_id);
CREATE INDEX idx_tasks_assigned ON projects.tasks (assigned_to);
CREATE INDEX idx_tasks_boq_item ON projects.tasks (boq_item_id);

-- ─── site_ops.permits (§11 Permit) ───────────────────────────────────────────

CREATE TABLE site_ops.permits (
  permit_id      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID         NOT NULL,
  project_id     UUID         NOT NULL,
  permit_type    VARCHAR(20)  NOT NULL
                   CHECK (permit_type IN ('WORK_PERMIT', 'SAFETY_PERMIT', 'DRAWING_APPROVAL', 'ENTRY_PERMIT')),
  permit_number  VARCHAR(64)  NOT NULL,
  issued_by      UUID,
  valid_from     DATE,
  valid_until    DATE,
  status         VARCHAR(10)  NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING', 'ACTIVE', 'EXPIRED', 'REVOKED')),
  linked_task_id UUID,
  created_by     UUID,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_permits_project ON site_ops.permits (project_id, tenant_id);
CREATE INDEX idx_permits_linked_task ON site_ops.permits (linked_task_id);

-- ─── ALTER existing site_ops tables for completion-gate links ─────────────────

ALTER TABLE site_ops.issues
  ADD COLUMN IF NOT EXISTS task_id UUID,
  ADD COLUMN IF NOT EXISTS issue_type VARCHAR(15) NOT NULL DEFAULT 'GENERAL'
    CHECK (issue_type IN ('DEFECT', 'REWORK', 'PUNCH', 'GENERAL'));

CREATE INDEX IF NOT EXISTS idx_issues_task ON site_ops.issues (task_id);

ALTER TABLE site_ops.inspections
  ADD COLUMN IF NOT EXISTS task_id UUID;

CREATE INDEX IF NOT EXISTS idx_inspections_task ON site_ops.inspections (task_id);

-- ─── RLS: tenant isolation (replicate §Phase 16 standard policy) ──────────────

DO $$ DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES ('projects', 'tasks'), ('site_ops', 'permits')) AS x(sch, tbl)
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t.sch, t.tbl);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', t.sch, t.tbl);
    EXECUTE format('DROP POLICY IF EXISTS rls_tenant_isolation ON %I.%I', t.sch, t.tbl);
    EXECUTE format($p$
      CREATE POLICY rls_tenant_isolation ON %I.%I
        AS PERMISSIVE FOR ALL TO app_user
        USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid)
    $p$, t.sch, t.tbl);
  END LOOP;
END $$;
