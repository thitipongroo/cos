-- Phase 6 — material_consumptions (KD-SITE-001 RESOLVED)
-- Adds material consumption tracking to site_ops schema.
-- material_id is a UUID generated on insert; gains FK → materials.material_id in a future phase.
-- task_id is nullable free-text until a Task entity exists.
-- Financial precision: DECIMAL(10,4) for quantity per spec §FINANCIAL PRECISION SPEC.

CREATE TABLE IF NOT EXISTS site_ops.material_consumptions (
  consumption_id  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID          NOT NULL,
  tenant_id       UUID          NOT NULL,
  report_id       UUID          REFERENCES site_ops.site_reports(report_id) ON DELETE SET NULL,
  material_name   VARCHAR(255)  NOT NULL,
  material_id     UUID          NOT NULL DEFAULT gen_random_uuid(),
  task_id         VARCHAR(255),
  quantity        DECIMAL(10,4) NOT NULL,
  unit            VARCHAR(50)   NOT NULL,
  consumed_by     UUID          NOT NULL,
  consumed_at     TIMESTAMPTZ   NOT NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_consumptions_project_tenant
  ON site_ops.material_consumptions (project_id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_material_consumptions_report
  ON site_ops.material_consumptions (report_id)
  WHERE report_id IS NOT NULL;
