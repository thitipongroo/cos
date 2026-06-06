-- Phase 0 Section D — Master Data Schemas
-- Creates: procurement.materials, site_ops.work_categories, site_ops.issue_categories,
--          site_ops.inspection_types, finance.cost_categories
-- All tables: tenant-scoped (tenant_id NOT NULL), RLS RESTRICTIVE POLICY, schema-qualified names.
-- Vendors already exist in procurement schema (Phase 5).
-- Backward-compatible: new tables only, no changes to existing tables.
-- Rollback: migrations/rollbacks/20260607000001_phase0_master_data_schemas.rollback.sql

-- ─── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "MaterialCategory" AS ENUM (
    'CONCRETE', 'STEEL', 'FORMWORK', 'ELECTRICAL',
    'PLUMBING', 'FINISHES', 'EQUIPMENT', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MaterialUnit" AS ENUM (
    'KG', 'TON', 'M3', 'M2', 'M', 'UNIT', 'SET', 'BAG', 'ROLL'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CostCategoryType" AS ENUM (
    'MATERIAL', 'LABOR', 'EQUIPMENT', 'OVERHEAD'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "IssueSeverityDefault" AS ENUM (
    'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── procurement.materials ─────────────────────────────────────────────────────
-- Source: Priority 0 §D — shared master data for procurement requests and site material usage.

CREATE TABLE IF NOT EXISTS procurement.materials (
  material_id   UUID              NOT NULL DEFAULT gen_random_uuid(),
  tenant_id     UUID              NOT NULL,
  name          VARCHAR(255)      NOT NULL,
  category      "MaterialCategory" NOT NULL,
  unit          "MaterialUnit"    NOT NULL,
  is_active     BOOLEAN           NOT NULL DEFAULT true,
  created_by    UUID              NOT NULL,
  created_at    TIMESTAMPTZ       NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ       NOT NULL DEFAULT now(),

  CONSTRAINT materials_pkey PRIMARY KEY (material_id),
  CONSTRAINT uq_materials_tenant_name UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_materials_tenant ON procurement.materials (tenant_id);
CREATE INDEX IF NOT EXISTS idx_materials_tenant_active ON procurement.materials (tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_materials_category ON procurement.materials (tenant_id, category);

ALTER TABLE procurement.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.materials FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON procurement.materials AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- ─── site_ops.work_categories ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS site_ops.work_categories (
  work_category_id UUID         NOT NULL DEFAULT gen_random_uuid(),
  tenant_id        UUID         NOT NULL,
  name             VARCHAR(255) NOT NULL,
  code             VARCHAR(50)  NOT NULL,
  phase            VARCHAR(100),
  is_active        BOOLEAN      NOT NULL DEFAULT true,
  created_by       UUID         NOT NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT work_categories_pkey PRIMARY KEY (work_category_id),
  CONSTRAINT uq_work_categories_tenant_code UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_work_categories_tenant ON site_ops.work_categories (tenant_id);

ALTER TABLE site_ops.work_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_ops.work_categories FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON site_ops.work_categories AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- ─── site_ops.issue_categories ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS site_ops.issue_categories (
  issue_category_id UUID                 NOT NULL DEFAULT gen_random_uuid(),
  tenant_id         UUID                 NOT NULL,
  name              VARCHAR(255)         NOT NULL,
  severity_default  "IssueSeverityDefault" NOT NULL DEFAULT 'MEDIUM',
  is_active         BOOLEAN              NOT NULL DEFAULT true,
  created_by        UUID                 NOT NULL,
  created_at        TIMESTAMPTZ          NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ          NOT NULL DEFAULT now(),

  CONSTRAINT issue_categories_pkey PRIMARY KEY (issue_category_id),
  CONSTRAINT uq_issue_categories_tenant_name UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_issue_categories_tenant ON site_ops.issue_categories (tenant_id);

ALTER TABLE site_ops.issue_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_ops.issue_categories FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON site_ops.issue_categories AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- ─── site_ops.inspection_types ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS site_ops.inspection_types (
  inspection_type_id UUID         NOT NULL DEFAULT gen_random_uuid(),
  tenant_id          UUID         NOT NULL,
  name               VARCHAR(255) NOT NULL,
  checklist_template JSONB        NOT NULL DEFAULT '[]',
  is_active          BOOLEAN      NOT NULL DEFAULT true,
  created_by         UUID         NOT NULL,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT inspection_types_pkey PRIMARY KEY (inspection_type_id),
  CONSTRAINT uq_inspection_types_tenant_name UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_inspection_types_tenant ON site_ops.inspection_types (tenant_id);

ALTER TABLE site_ops.inspection_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_ops.inspection_types FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON site_ops.inspection_types AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- ─── finance.cost_categories ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS finance.cost_categories (
  cost_category_id UUID               NOT NULL DEFAULT gen_random_uuid(),
  tenant_id        UUID               NOT NULL,
  name             VARCHAR(255)       NOT NULL,
  type             "CostCategoryType" NOT NULL,
  is_active        BOOLEAN            NOT NULL DEFAULT true,
  created_by       UUID               NOT NULL,
  created_at       TIMESTAMPTZ        NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ        NOT NULL DEFAULT now(),

  CONSTRAINT cost_categories_pkey PRIMARY KEY (cost_category_id),
  CONSTRAINT uq_cost_categories_tenant_name UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_cost_categories_tenant ON finance.cost_categories (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cost_categories_type ON finance.cost_categories (tenant_id, type);

ALTER TABLE finance.cost_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.cost_categories FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance.cost_categories AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);
