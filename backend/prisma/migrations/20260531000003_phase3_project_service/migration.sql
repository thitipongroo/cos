-- Phase 3: Project Service — tenant-scoped tables
-- These tables are created in EACH tenant schema by the migration runner,
-- which sets search_path per tenant before executing.
-- Backward-compatible: new tables only, no changes to existing schemas.
-- Rollback: migrations/rollbacks/20260531000003_phase3_project_service.rollback.sql

-- ─── Enums ────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "ProjectType" AS ENUM (
    'RESIDENTIAL',
    'COMMERCIAL',
    'INFRASTRUCTURE',
    'INDUSTRIAL'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ProjectStatus" AS ENUM (
    'DRAFT',
    'ACTIVE',
    'ON_HOLD',
    'COMPLETED',
    'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ProjectMemberRole" AS ENUM (
    'SYSTEM_ADMIN',
    'TENANT_ADMIN',
    'EXECUTIVE',
    'PROJECT_MANAGER',
    'PROCUREMENT_OFFICER',
    'FINANCE',
    'SAFETY_OFFICER',
    'SITE_ENGINEER',
    'CRM_SALES_MANAGER',
    'PROC_MANAGER',
    'SITE_WORKER',
    'VIEWER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── projects ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS projects (
  project_id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        NOT NULL,
  project_code        VARCHAR(50) NOT NULL,
  project_name        VARCHAR(255) NOT NULL,
  project_type        "ProjectType" NOT NULL,
  status              "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
  budget_amount       DECIMAL(19,4),
  budget_currency     VARCHAR(3),   -- ISO 4217
  start_date          DATE,
  end_date            DATE,
  on_hold_reason      VARCHAR(500),
  on_hold_at          TIMESTAMPTZ,
  cancellation_reason VARCHAR(500),
  cancelled_at        TIMESTAMPTZ,
  created_by          UUID        NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_projects_tenant_code UNIQUE (tenant_id, project_code)
);

CREATE INDEX IF NOT EXISTS idx_projects_tenant_status
  ON projects (tenant_id, status);

-- ─── project_members ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_members (
  membership_id   UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID              NOT NULL REFERENCES projects (project_id) ON DELETE CASCADE,
  tenant_id       UUID              NOT NULL,
  user_id         UUID              NOT NULL,
  role            "ProjectMemberRole" NOT NULL,
  assigned_at     TIMESTAMPTZ       NOT NULL DEFAULT now(),
  assigned_by     UUID              NOT NULL,
  CONSTRAINT uq_project_members_project_user UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_tenant
  ON project_members (tenant_id, project_id);

-- ─── project_documents ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_documents (
  document_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID        NOT NULL REFERENCES projects (project_id) ON DELETE CASCADE,
  tenant_id       UUID        NOT NULL,
  file_id         UUID,                  -- loose coupling to File Service (no FK constraint)
  document_type   VARCHAR(100),
  uploaded_by     UUID        NOT NULL,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_documents_project
  ON project_documents (project_id);

-- ─── outbox_events (per-tenant, mirrors Phase 8 platform outbox) ───────────
-- The outbox table for project events lives in the tenant schema so
-- outbox polling is tenant-isolated and schema-path-aware.

CREATE TABLE IF NOT EXISTS outbox_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    VARCHAR(255) NOT NULL,
  payload       JSONB       NOT NULL,
  published     BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_outbox_events_unpublished
  ON outbox_events (published, created_at)
  WHERE published = false;
