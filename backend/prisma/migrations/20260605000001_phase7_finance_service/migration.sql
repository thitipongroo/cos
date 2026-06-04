-- Phase 7: Finance Service — project cost tracking schema
-- All cross-service data arrives via Kafka (no direct FK to procurement tables).
-- Backward-compatible: new schema, no modifications to existing schemas.

CREATE SCHEMA IF NOT EXISTS finance;
SET search_path = finance;

-- ─── project_budgets ─────────────────────────────────────────────────────────

CREATE TABLE finance.project_budgets (
  budget_id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                UUID        NOT NULL UNIQUE,
  tenant_id                 UUID        NOT NULL,
  total_budget_amount       DECIMAL(19,4) NOT NULL,
  total_budget_currency     VARCHAR(3)  NOT NULL,
  allocated_amount          DECIMAL(19,4) NOT NULL DEFAULT 0,
  committed_amount          DECIMAL(19,4) NOT NULL DEFAULT 0,
  actual_amount             DECIMAL(19,4) NOT NULL DEFAULT 0,
  -- variance_alert_threshold: default 10%; TENANT_ADMIN can override per project
  variance_alert_threshold  DECIMAL(5,2)  NOT NULL DEFAULT 10.00,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_budgets_tenant ON finance.project_budgets (tenant_id, project_id);

-- ─── budget_lines ─────────────────────────────────────────────────────────────

CREATE TABLE finance.budget_lines (
  line_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id         UUID        NOT NULL REFERENCES finance.project_budgets(budget_id),
  project_id        UUID        NOT NULL,
  tenant_id         UUID        NOT NULL,
  boq_category_id   UUID,
  line_name         VARCHAR(255) NOT NULL,
  allocated_amount  DECIMAL(19,4) NOT NULL,
  currency_code     VARCHAR(3)  NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_budget_lines_budget ON finance.budget_lines (budget_id, tenant_id);

-- ─── cost_transactions ────────────────────────────────────────────────────────

CREATE TYPE finance."CostSourceType" AS ENUM ('PURCHASE_ORDER', 'INVOICE', 'ADJUSTMENT');

CREATE TABLE finance.cost_transactions (
  transaction_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID        NOT NULL,
  tenant_id         UUID        NOT NULL,
  source_type       finance."CostSourceType" NOT NULL,
  source_id         UUID        NOT NULL,
  budget_line_id    UUID        REFERENCES finance.budget_lines(line_id),
  amount            DECIMAL(19,4) NOT NULL,
  currency_code     VARCHAR(3)  NOT NULL,
  transaction_date  DATE        NOT NULL,
  description       TEXT,
  recorded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by       UUID
);

CREATE INDEX idx_cost_transactions_project ON finance.cost_transactions (project_id, tenant_id, transaction_date);

-- ─── payments ─────────────────────────────────────────────────────────────────

CREATE TYPE finance."PaymentStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

CREATE TABLE finance.payments (
  payment_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id        UUID        NOT NULL,
  project_id        UUID        NOT NULL,
  tenant_id         UUID        NOT NULL,
  amount            DECIMAL(19,4) NOT NULL,
  currency_code     VARCHAR(3)  NOT NULL,
  payment_date      DATE        NOT NULL,
  payment_reference VARCHAR(255),
  status            finance."PaymentStatus" NOT NULL DEFAULT 'PENDING',
  recorded_by       UUID        NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_project ON finance.payments (project_id, tenant_id);

-- ─── retention_records ───────────────────────────────────────────────────────

CREATE TYPE finance."RetentionStatus" AS ENUM ('HELD', 'RELEASED', 'PARTIAL_RELEASE');

CREATE TABLE finance.retention_records (
  retention_id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id                 UUID        NOT NULL,
  project_id            UUID        NOT NULL,
  tenant_id             UUID        NOT NULL,
  retention_percentage  DECIMAL(5,2),
  retention_amount      DECIMAL(19,4),
  currency_code         VARCHAR(3),
  status                finance."RetentionStatus" NOT NULL DEFAULT 'HELD'
);

CREATE INDEX idx_retention_project ON finance.retention_records (project_id, tenant_id);
