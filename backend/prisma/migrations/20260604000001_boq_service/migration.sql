-- Phase 4: BOQ (Bill of Quantities) Service
-- Creates: boq_versions, boq_categories, boq_items in the tenant schema.
-- Financial precision: DECIMAL(19,4) for all monetary fields (spec §FINANCIAL PRECISION SPEC).
-- Carbon fields: NULLABLE — forward-compatible hook for CarbonCalculationEngine.
-- Backward-compatible: new tables only, no modification to existing tables.
-- Rollback: migrations/rollbacks/20260604000001_phase4_boq_service.rollback.sql

-- ─── boq_versions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS boq_versions (
  version_id                 UUID         NOT NULL DEFAULT gen_random_uuid(),
  project_id                 UUID         NOT NULL,
  tenant_id                  UUID         NOT NULL,
  version_number             INTEGER      NOT NULL,
  version_name               VARCHAR(100),
  status                     VARCHAR(20)  NOT NULL DEFAULT 'DRAFT'
                               CHECK (status IN ('DRAFT','APPROVED','SUPERSEDED')),
  total_estimated_amount     DECIMAL(19,4) NOT NULL DEFAULT 0,
  total_estimated_currency   VARCHAR(3)   NOT NULL,
  approved_by                UUID,
  approved_at                TIMESTAMPTZ,
  created_by                 UUID         NOT NULL,
  created_at                 TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT boq_versions_pkey PRIMARY KEY (version_id),
  CONSTRAINT uq_boq_versions_project_number UNIQUE (project_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_boq_versions_project_tenant
  ON boq_versions (project_id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_boq_versions_status
  ON boq_versions (project_id, status);

-- ─── boq_categories ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS boq_categories (
  category_id        UUID         NOT NULL DEFAULT gen_random_uuid(),
  version_id         UUID         NOT NULL REFERENCES boq_versions (version_id) ON DELETE CASCADE,
  tenant_id          UUID         NOT NULL,
  parent_category_id UUID         REFERENCES boq_categories (category_id) ON DELETE CASCADE,
  category_code      VARCHAR(50)  NOT NULL,
  category_name      VARCHAR(255) NOT NULL,
  sort_order         INTEGER      NOT NULL DEFAULT 0,
  subtotal_amount    DECIMAL(19,4) NOT NULL DEFAULT 0,

  CONSTRAINT boq_categories_pkey PRIMARY KEY (category_id)
);

CREATE INDEX IF NOT EXISTS idx_boq_categories_version
  ON boq_categories (version_id);

-- ─── boq_items ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS boq_items (
  item_id                UUID          NOT NULL DEFAULT gen_random_uuid(),
  category_id            UUID          NOT NULL REFERENCES boq_categories (category_id) ON DELETE CASCADE,
  version_id             UUID          NOT NULL REFERENCES boq_versions (version_id) ON DELETE CASCADE,
  tenant_id              UUID          NOT NULL,
  item_code              VARCHAR(100),
  description            TEXT          NOT NULL,
  unit                   VARCHAR(50)   NOT NULL,
  quantity               DECIMAL(10,4) NOT NULL,
  unit_cost              DECIMAL(19,4) NOT NULL,
  estimated_total        DECIMAL(19,4) NOT NULL,  -- ROUND(quantity × unit_cost, 4) HALF_UP
  currency_code          VARCHAR(3)    NOT NULL,
  sort_order             INTEGER       NOT NULL DEFAULT 0,
  -- Carbon fields: NULLABLE — forward-compatible hook for CarbonCalculationEngine (Phase 23+)
  carbon_factor_kg_co2e  DECIMAL(10,6),           -- kgCO2e per unit; NULL until engine activated
  carbon_total_kg_co2e   DECIMAL(14,4),           -- ROUND(quantity × carbon_factor, 4); NULL if factor NULL
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT boq_items_pkey PRIMARY KEY (item_id)
);

CREATE INDEX IF NOT EXISTS idx_boq_items_version_category
  ON boq_items (version_id, category_id);
