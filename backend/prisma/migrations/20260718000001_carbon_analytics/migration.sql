-- Phase 24 — Carbon analytics (spec §33.4 CarbonRecord, §33.5 carbon.record.created.v1)
--
-- Two tables:
--   site_ops.carbon_factors  — the per-tenant emission-factor library
--   site_ops.carbon_records  — one embodied-carbon record per material consumption
--
-- Schema choice: `site_ops`. The product owner assigned the CarbonRecord calculation to the
-- site-ops module (§33.5 names the trigger — "carbon record generated from material consumption" —
-- but not the owning service), and the parent row lives in site_ops.material_consumptions, so the
-- FK stays inside one schema. Move both tables if carbon later becomes its own bounded context.
--
-- Standards (§33.4): factors are kgCO₂e per declared unit under EN 15804:2012+A2:2019 /
-- ISO 21930:2017 life-cycle modules A1–A3. The platform ships NO factors — each tenant loads its
-- own from its chosen EPD source, which is why carbon_factors is tenant-scoped with no seed data.

-- ── carbon_factors — per-tenant, per-material emission factor library ────────────────────────────
CREATE TABLE IF NOT EXISTS site_ops.carbon_factors (
  carbon_factor_id  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID          NOT NULL,
  material_id       UUID          NOT NULL,
  carbon_factor     DECIMAL(10,6) NOT NULL,
  declared_unit     VARCHAR(50)   NOT NULL,
  -- §33.4: "carbon_factor_source MUST be recorded for every factor used to enable audit trail."
  source            VARCHAR(500)  NOT NULL,
  standard          VARCHAR(50)   NOT NULL DEFAULT 'EN 15804:2012+A2:2019',
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT carbon_factors_positive CHECK (carbon_factor >= 0)
);

-- One active factor per material per tenant — the lookup the producer performs.
CREATE UNIQUE INDEX IF NOT EXISTS idx_carbon_factors_tenant_material
  ON site_ops.carbon_factors (tenant_id, material_id);

-- ── carbon_records — embodied carbon derived from a material consumption ─────────────────────────
CREATE TABLE IF NOT EXISTS site_ops.carbon_records (
  carbon_record_id     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID          NOT NULL,
  project_id           UUID          NOT NULL REFERENCES projects.projects(project_id),
  consumption_id       UUID          NOT NULL
                                     REFERENCES site_ops.material_consumptions(consumption_id)
                                     ON DELETE CASCADE,
  -- FK is safe here even though site_ops.material_consumptions.material_id is a loose UUID
  -- (DEFAULT gen_random_uuid(), no FK): a carbon record is only ever created when the consumption's
  -- material_name resolved against procurement.materials, so this column always holds a real
  -- master id. Consumptions whose material is not in the master simply get no carbon record.
  -- No ON DELETE clause — the default RESTRICT is wanted: deleting a material that has emitted
  -- carbon records must fail rather than orphan audited emissions data (§33.4 audit trail).
  material_id          UUID          NOT NULL REFERENCES procurement.materials(material_id),
  quantity_consumed    DECIMAL(10,4) NOT NULL,
  unit                 VARCHAR(50)   NOT NULL,
  carbon_factor        DECIMAL(10,6) NOT NULL,
  -- Copied from the factor row at calculation time, not joined at read time: a tenant may revise a
  -- factor later, and an emitted carbon record must stay reproducible for audit (§33.4).
  carbon_factor_source VARCHAR(500)  NOT NULL,
  carbon_kgco2e        DECIMAL(19,4) NOT NULL,
  recorded_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT carbon_records_kgco2e_non_negative CHECK (carbon_kgco2e >= 0)
);

-- One carbon record per consumption. Makes the producer idempotent: a replayed
-- site.material.consumed event cannot double-count a project's footprint.
CREATE UNIQUE INDEX IF NOT EXISTS idx_carbon_records_consumption
  ON site_ops.carbon_records (consumption_id);

-- Project-level aggregation (§33.4 GHG Protocol Scope 3 reporting) is the dominant read.
CREATE INDEX IF NOT EXISTS idx_carbon_records_project_tenant
  ON site_ops.carbon_records (project_id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_carbon_records_recorded_at
  ON site_ops.carbon_records (recorded_at);

-- ── RLS (QM-9) ───────────────────────────────────────────────────────────────────────────────────
ALTER TABLE site_ops.carbon_factors ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_ops.carbon_factors FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_tenant_isolation ON site_ops.carbon_factors;

CREATE POLICY rls_tenant_isolation ON site_ops.carbon_factors
  AS PERMISSIVE
  FOR ALL
  TO app_user
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid);

ALTER TABLE site_ops.carbon_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_ops.carbon_records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_tenant_isolation ON site_ops.carbon_records;

CREATE POLICY rls_tenant_isolation ON site_ops.carbon_records
  AS PERMISSIVE
  FOR ALL
  TO app_user
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid);
