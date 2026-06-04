-- Phase 5: Procurement Service
-- Creates: vendors, purchase_requests, rfqs, quotations, purchase_orders,
--          po_line_items, deliveries, invoices, vendor_score_weights, wht_rules
-- Financial precision: DECIMAL(19,4) for all monetary fields (spec §FINANCIAL PRECISION SPEC).
-- tax_id stored as-is — no validation by design (multi-country format).
-- Backward-compatible: new tables only, no modification to existing tables.
-- Rollback: migrations/rollbacks/20260604000002_phase5_procurement_service.rollback.sql

-- ─── vendors ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  vendor_id       UUID         NOT NULL DEFAULT gen_random_uuid(),
  tenant_id       UUID         NOT NULL,
  vendor_code     VARCHAR(50)  NOT NULL,
  vendor_name     VARCHAR(255) NOT NULL,
  tax_id          VARCHAR(100),
  contact_email   VARCHAR(255),
  contact_phone   VARCHAR(50),
  address         TEXT,
  is_active       BOOLEAN      NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT vendors_pkey PRIMARY KEY (vendor_id),
  CONSTRAINT uq_vendors_tenant_code UNIQUE (tenant_id, vendor_code)
);

CREATE INDEX IF NOT EXISTS idx_vendors_tenant ON vendors (tenant_id);
CREATE INDEX IF NOT EXISTS idx_vendors_active ON vendors (tenant_id, is_active);

-- ─── purchase_requests ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_requests (
  pr_id           UUID         NOT NULL DEFAULT gen_random_uuid(),
  project_id      UUID         NOT NULL,
  tenant_id       UUID         NOT NULL,
  pr_number       VARCHAR(50)  NOT NULL,
  status          VARCHAR(20)  NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','PO_CREATED')),
  requested_by    UUID         NOT NULL,
  required_date   DATE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT purchase_requests_pkey PRIMARY KEY (pr_id),
  CONSTRAINT uq_pr_tenant_number UNIQUE (tenant_id, pr_number)
);

CREATE INDEX IF NOT EXISTS idx_pr_project_tenant ON purchase_requests (project_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_pr_status ON purchase_requests (tenant_id, status);

-- ─── rfqs ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rfqs (
  rfq_id                 UUID         NOT NULL DEFAULT gen_random_uuid(),
  pr_id                  UUID         REFERENCES purchase_requests (pr_id) ON DELETE SET NULL,
  project_id             UUID         NOT NULL,
  tenant_id              UUID         NOT NULL,
  rfq_number             VARCHAR(50)  NOT NULL,
  status                 VARCHAR(20)  NOT NULL DEFAULT 'DRAFT'
                           CHECK (status IN ('DRAFT','PUBLISHED','CLOSED','EVALUATED','AWARDED','CANCELLED')),
  deadline               TIMESTAMPTZ  NOT NULL,
  temporal_workflow_id   VARCHAR(255),
  created_by             UUID         NOT NULL,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT rfqs_pkey PRIMARY KEY (rfq_id)
);

CREATE INDEX IF NOT EXISTS idx_rfqs_project_tenant ON rfqs (project_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_rfqs_status ON rfqs (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_rfqs_pr ON rfqs (pr_id) WHERE pr_id IS NOT NULL;

-- ─── quotations ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quotations (
  quotation_id    UUID          NOT NULL DEFAULT gen_random_uuid(),
  rfq_id          UUID          NOT NULL REFERENCES rfqs (rfq_id) ON DELETE CASCADE,
  vendor_id       UUID          NOT NULL REFERENCES vendors (vendor_id),
  tenant_id       UUID          NOT NULL,
  total_amount    DECIMAL(19,4) NOT NULL,
  currency_code   VARCHAR(3)    NOT NULL,
  validity_days   INTEGER       NOT NULL,
  submitted_at    TIMESTAMPTZ   NOT NULL,
  is_selected     BOOLEAN       NOT NULL DEFAULT false,

  CONSTRAINT quotations_pkey PRIMARY KEY (quotation_id),
  CONSTRAINT uq_quotation_rfq_vendor UNIQUE (rfq_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_quotations_rfq ON quotations (rfq_id);
CREATE INDEX IF NOT EXISTS idx_quotations_vendor ON quotations (vendor_id, tenant_id);

-- ─── purchase_orders ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_orders (
  po_id                  UUID          NOT NULL DEFAULT gen_random_uuid(),
  rfq_id                 UUID          REFERENCES rfqs (rfq_id) ON DELETE SET NULL,
  vendor_id              UUID          NOT NULL REFERENCES vendors (vendor_id),
  project_id             UUID          NOT NULL,
  tenant_id              UUID          NOT NULL,
  po_number              VARCHAR(50)   NOT NULL,
  status                 VARCHAR(25)   NOT NULL DEFAULT 'DRAFT'
                           CHECK (status IN (
                             'DRAFT','PENDING_APPROVAL','APPROVED','SENT','ACKNOWLEDGED',
                             'PARTIALLY_DELIVERED','FULLY_DELIVERED','INVOICED','PAID','DISPUTED'
                           )),
  total_amount           DECIMAL(19,4) NOT NULL,
  currency_code          VARCHAR(3)    NOT NULL,
  delivery_date          DATE          NOT NULL,
  temporal_workflow_id   VARCHAR(255),
  created_by             UUID          NOT NULL,
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT purchase_orders_pkey PRIMARY KEY (po_id),
  CONSTRAINT uq_po_tenant_number UNIQUE (tenant_id, po_number)
);

CREATE INDEX IF NOT EXISTS idx_po_project_tenant ON purchase_orders (project_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_po_vendor ON purchase_orders (vendor_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders (tenant_id, status);

-- ─── po_line_items ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS po_line_items (
  line_id         UUID          NOT NULL DEFAULT gen_random_uuid(),
  po_id           UUID          NOT NULL REFERENCES purchase_orders (po_id) ON DELETE CASCADE,
  tenant_id       UUID          NOT NULL,
  boq_item_id     UUID,
  description     TEXT          NOT NULL,
  quantity        DECIMAL(10,4) NOT NULL,
  unit            VARCHAR(50)   NOT NULL,
  unit_price      DECIMAL(19,4) NOT NULL,
  line_total      DECIMAL(19,4) NOT NULL,

  CONSTRAINT po_line_items_pkey PRIMARY KEY (line_id)
);

CREATE INDEX IF NOT EXISTS idx_po_line_items_po ON po_line_items (po_id);

-- ─── deliveries ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deliveries (
  delivery_id     UUID         NOT NULL DEFAULT gen_random_uuid(),
  po_id           UUID         NOT NULL REFERENCES purchase_orders (po_id) ON DELETE RESTRICT,
  tenant_id       UUID         NOT NULL,
  delivery_note   VARCHAR(100),
  delivered_at    TIMESTAMPTZ  NOT NULL,
  received_by     UUID         NOT NULL,
  notes           TEXT,

  CONSTRAINT deliveries_pkey PRIMARY KEY (delivery_id)
);

CREATE INDEX IF NOT EXISTS idx_deliveries_po ON deliveries (po_id, tenant_id);

-- ─── delivery_items ────────────────────────────────────────────────────────
-- Tracks per-line-item quantities received in each delivery.
CREATE TABLE IF NOT EXISTS delivery_items (
  delivery_item_id  UUID          NOT NULL DEFAULT gen_random_uuid(),
  delivery_id       UUID          NOT NULL REFERENCES deliveries (delivery_id) ON DELETE CASCADE,
  line_id           UUID          NOT NULL REFERENCES po_line_items (line_id) ON DELETE RESTRICT,
  tenant_id         UUID          NOT NULL,
  quantity_received DECIMAL(10,4) NOT NULL,

  CONSTRAINT delivery_items_pkey PRIMARY KEY (delivery_item_id),
  CONSTRAINT uq_delivery_line UNIQUE (delivery_id, line_id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_items_delivery ON delivery_items (delivery_id);

-- ─── invoices ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  invoice_id      UUID          NOT NULL DEFAULT gen_random_uuid(),
  po_id           UUID          NOT NULL REFERENCES purchase_orders (po_id) ON DELETE RESTRICT,
  vendor_id       UUID          NOT NULL REFERENCES vendors (vendor_id),
  tenant_id       UUID          NOT NULL,
  invoice_number  VARCHAR(100)  NOT NULL,
  amount          DECIMAL(19,4) NOT NULL,
  currency_code   VARCHAR(3)    NOT NULL,
  invoice_date    DATE          NOT NULL,
  due_date        DATE          NOT NULL,
  status          VARCHAR(20)   NOT NULL DEFAULT 'RECEIVED'
                    CHECK (status IN ('RECEIVED','VERIFIED','APPROVED','PAID','DISPUTED')),
  file_id         UUID,

  CONSTRAINT invoices_pkey PRIMARY KEY (invoice_id),
  CONSTRAINT uq_invoice_po_number UNIQUE (po_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_invoices_po ON invoices (po_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_vendor ON invoices (vendor_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices (tenant_id, status);

-- ─── vendor_score_weights ──────────────────────────────────────────────────
-- Tenant-configurable scoring criteria weights.
-- Default: equal 1/3 each (on_time_delivery, quality, price).
CREATE TABLE IF NOT EXISTS vendor_score_weights (
  weight_id       UUID          NOT NULL DEFAULT gen_random_uuid(),
  tenant_id       UUID          NOT NULL,
  criteria_name   VARCHAR(50)   NOT NULL
                    CHECK (criteria_name IN ('on_time_delivery','quality','price')),
  weight          DECIMAL(5,2)  NOT NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT vendor_score_weights_pkey PRIMARY KEY (weight_id),
  CONSTRAINT uq_vsw_tenant_criteria UNIQUE (tenant_id, criteria_name)
);

-- ─── wht_rules ─────────────────────────────────────────────────────────────
-- Withholding Tax rules per tenant / jurisdiction (spec §13.3).
-- Thailand defaults: 3% services, 5% rent — seeded at tenant provisioning.
CREATE TABLE IF NOT EXISTS wht_rules (
  rule_id         UUID          NOT NULL DEFAULT gen_random_uuid(),
  tenant_id       UUID          NOT NULL,
  jurisdiction    VARCHAR(10)   NOT NULL,  -- ISO 3166-1 alpha-2 (TH, SG, etc.)
  vendor_type     VARCHAR(50)   NOT NULL,  -- e.g. 'services', 'rent', 'goods'
  rate            DECIMAL(5,2)  NOT NULL,  -- percentage e.g. 3.00
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT wht_rules_pkey PRIMARY KEY (rule_id),
  CONSTRAINT uq_wht_tenant_jurisdiction_type UNIQUE (tenant_id, jurisdiction, vendor_type)
);
