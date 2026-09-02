# Phase 5 — Procurement Service

> Moved out of `context/00_master_construction_os.md` on 2026-09-02, verbatim.
> That file keeps the index row pointing here; `.claude/skills/phase-index/SKILL.md`
> is the map. Depends on Phase 3, 4 · SaaS Maturity Stage 2.
>
> Rule 36 applies at the end of this phase and Rule 38 before it starts.

```text
Build Procurement Service.

Workflow Engine: Temporal (see WORKFLOW ENGINE SPEC section above).
Financial Precision: follow FINANCIAL PRECISION SPEC section above.

Entities (PostgreSQL — schema: procurement):
  vendors:
    vendor_id       UUID PK
    tenant_id       UUID NOT NULL
    vendor_code     VARCHAR(50) NOT NULL
    vendor_name     VARCHAR(255) NOT NULL
    tax_id          VARCHAR(100)    — stored as-is, not validated (multi-country format, no validation by design)
    contact_email   VARCHAR(255)
    contact_phone   VARCHAR(50)
    address         TEXT
    is_active       BOOLEAN DEFAULT true
    created_at      TIMESTAMPTZ DEFAULT now()
    UNIQUE: (tenant_id, vendor_code)

  purchase_requests:
    pr_id           UUID PK
    project_id      UUID NOT NULL
    tenant_id       UUID NOT NULL
    pr_number       VARCHAR(50) NOT NULL
    status          ENUM('DRAFT','SUBMITTED','APPROVED','REJECTED','PO_CREATED')
    requested_by    UUID NOT NULL
    required_date   DATE
    created_at      TIMESTAMPTZ DEFAULT now()
    UNIQUE: (tenant_id, pr_number)

  rfqs:
    rfq_id          UUID PK
    pr_id           UUID FK
    project_id      UUID NOT NULL
    tenant_id       UUID NOT NULL
    rfq_number      VARCHAR(50) NOT NULL
    status          ENUM('DRAFT','PUBLISHED','CLOSED','EVALUATED','AWARDED','CANCELLED')
    deadline        TIMESTAMPTZ NOT NULL
    temporal_workflow_id VARCHAR(255)  — Temporal workflow run ID
    created_by      UUID NOT NULL
    created_at      TIMESTAMPTZ DEFAULT now()

  quotations:
    quotation_id    UUID PK
    rfq_id          UUID FK NOT NULL
    vendor_id       UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    total_amount    DECIMAL(19,4) NOT NULL
    currency_code   VARCHAR(3) NOT NULL
    validity_days   INTEGER NOT NULL
    submitted_at    TIMESTAMPTZ NOT NULL
    is_selected     BOOLEAN DEFAULT false

  purchase_orders:
    po_id           UUID PK
    rfq_id          UUID FK
    vendor_id       UUID FK NOT NULL
    project_id      UUID NOT NULL
    tenant_id       UUID NOT NULL
    po_number       VARCHAR(50) NOT NULL
    status          ENUM('DRAFT','PENDING_APPROVAL','APPROVED','SENT','ACKNOWLEDGED',
                         'PARTIALLY_DELIVERED','FULLY_DELIVERED','INVOICED',
                         'PAID','DISPUTED')
    total_amount    DECIMAL(19,4) NOT NULL
    currency_code   VARCHAR(3) NOT NULL
    delivery_date   DATE NOT NULL
    temporal_workflow_id VARCHAR(255)
    created_by      UUID NOT NULL
    created_at      TIMESTAMPTZ DEFAULT now()
    UNIQUE: (tenant_id, po_number)

  po_line_items:
    line_id         UUID PK
    po_id           UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    boq_item_id     UUID            — optional link to BOQ item
    description     TEXT NOT NULL
    quantity        DECIMAL(10,4) NOT NULL
    unit            VARCHAR(50) NOT NULL
    unit_price      DECIMAL(19,4) NOT NULL
    line_total      DECIMAL(19,4) NOT NULL  — ROUND(quantity × unit_price, 4)

  deliveries:
    delivery_id     UUID PK
    po_id           UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    delivery_note   VARCHAR(100)
    delivered_at    TIMESTAMPTZ NOT NULL
    received_by     UUID NOT NULL
    notes           TEXT

  delivery_items:   -- per-PO-line receipts; what fulfilment is actually computed from (spec §11.2,
                    -- added 2026-08-23 — the table existed but no spec defined it, TDD OQ-27)
    delivery_item_id  UUID PK
    delivery_id       UUID FK → deliveries NOT NULL  ON DELETE CASCADE
    line_id           UUID FK → po_line_items NOT NULL  ON DELETE RESTRICT
    tenant_id         UUID NOT NULL
    quantity_received DECIMAL(10,4) NOT NULL
    UNIQUE: (delivery_id, line_id)  -- one row per PO line per delivery; also the idempotency key
                                    -- that stops a replayed offline sync item double-counting a
                                    -- receipt and closing a PO on goods that arrived once (§17.4)

  invoices:
    invoice_id      UUID PK
    po_id           UUID FK NOT NULL
    vendor_id       UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    invoice_number  VARCHAR(100) NOT NULL
    amount          DECIMAL(19,4) NOT NULL
    currency_code   VARCHAR(3) NOT NULL
    invoice_date    DATE NOT NULL
    due_date        DATE NOT NULL
    status          ENUM('RECEIVED','VERIFIED','APPROVED','PAID','DISPUTED')
    file_id         UUID  — reference to File Service

Workflow Implementation:
  Use Temporal TypeScript SDK
  RFQ Workflow: implements RFQ state machine from WORKFLOW ENGINE SPEC
  PO Workflow:  implements PO state machine from WORKFLOW ENGINE SPEC
  Temporal Worker: runs in the cos-temporal-worker Deployment (backend image, worker command),
                   NOT inside the API process — see §32.2 and
                   infrastructure/helm/cos-temporal-worker/. Shares one process with the
                   enterprise-provisioning and data-export queues (added 2026-08-22; before
                   that no worker was launched anywhere and the RFQ/PO state machine never ran)
  Workflow compensation: on CANCELLED, emit compensation events to Finance Service

Generate:

- PostgreSQL migration files for all entities
- NestJS module, service, repository, controller
- Temporal workflow definitions for RFQ and PO
- Temporal worker setup and registration
- Quotation comparison service (sort by total_amount, mark is_selected)
- DTOs with validation for all APIs
- OpenAPI 3.1 spec
- APIs (authoritative: spec §14 Procurement APIs + Vendor APIs; AIP-132 List /
  AIP-159 cross-collection; tenant-scoped server-side via RLS + JWT; see ADR-022).
  Canonical prefix `/api/v1/procurement/*` for the ENTIRE module — vendors included
  (ADR-022 override: §14's separate `/api/v1/vendors` namespace was unified under
  `/api/v1/procurement/vendors`; §14 updated to match). There are NO project-scoped
  procurement list routes — per-project views use the tenant-wide lists with `?project_id=`:
    Vendors:
      POST   /api/v1/procurement/vendors
      GET    /api/v1/procurement/vendors
      GET    /api/v1/procurement/vendors/:vendorId
      GET    /api/v1/procurement/vendors/:vendorId/quotations  (vendor quotation history)
      DELETE /api/v1/procurement/vendors/:vendorId
    Purchase requests:
      POST   /api/v1/procurement/purchase-requests          (project_id in body)
      GET    /api/v1/procurement/purchase-requests           (filterable: status, project_id)
    RFQs:
      POST   /api/v1/procurement/rfqs
      GET    /api/v1/procurement/rfqs                         (filterable: status, project_id)
      POST   /api/v1/procurement/rfqs/:rfqId/publish|close|cancel|award
      GET    /api/v1/procurement/rfqs/:rfqId/quotations       (compare; RFQ CLOSED)
      POST   /api/v1/procurement/rfqs/:rfqId/quotations       (submit quotation)
      POST   /api/v1/procurement/rfqs/:rfqId/invitations      (invite a vendor — issues a Vendor Portal magic-link; ADR-030)
    Purchase orders:
      POST   /api/v1/procurement/purchase-orders
      GET    /api/v1/procurement/purchase-orders              (filterable: status, project_id)
      GET    /api/v1/procurement/purchase-orders/:poId
      GET    /api/v1/procurement/purchase-orders/:poId/deliveries
      POST   /api/v1/procurement/purchase-orders/:poId/submit|approve|reject|acknowledge|mark-paid|dispute
    Deliveries:
      POST   /api/v1/procurement/deliveries                  (po_id in body)
      GET    /api/v1/procurement/deliveries                  (filterable: po_id)
    Vendor invoices:
      POST   /api/v1/procurement/vendor-invoices             (po_id in body)
      GET    /api/v1/procurement/vendor-invoices?po_id=
      POST   /api/v1/procurement/vendor-invoices/:invoiceId/approve
    Vendor Portal — external vendor self-service (ADR-030; brought into MVP, overrides §28 Year 1–2
    timeline; spec §14 Vendor Portal + docs/api/vendor.openapi.yaml; pages §20.7.12 under /vendor):
      GET    /api/v1/vendor/rfq/:token                       (Tier-1 magic-link: open invited RFQ — no account)
      POST   /api/v1/vendor/rfq/:token/quotation             (Tier-1: submit quotation; returns a Tier-2 vendor session)
      GET    /api/v1/vendor/purchase-orders                  (Tier-2: track PO status; Bearer session + x-vendor-tenant-id)
      GET    /api/v1/vendor/invoices                          (Tier-2: list own invoices)
      POST   /api/v1/vendor/invoices                          (Tier-2: submit invoice)
      Entities: platform.vendor_identities + platform.vendor_trading_relationships (cross-tenant, no RLS)
                + procurement.rfq_invitations (RLS; magic-link token_hash). Reuses procurement
                rfqs/quotations/purchase_orders/invoices — no duplicate data model.
      Auth: VENDOR_PORTAL principal (not a CosRole); magic-link HMAC token (spec §5.4.3).
- Decimal.js used for all financial calculations
- Unit tests: workflow state transitions, financial calculations
- Integration tests: full procurement lifecycle with Temporal test server
- Kafka event producers (conform to Event Contract envelope):

    procurement.rfq.created
    procurement.rfq.status_changed  { rfq_id, from_status, to_status }
    procurement.po.created          (see Event Contract spec)
    procurement.po.status_changed   { po_id, from_status, to_status }
    procurement.delivery.received   { po_id, delivery_id, delivered_at }
    procurement.invoice.received    (see Event Contract spec)

Do not invent:

- approval hierarchy (use ROLE: PROC_MANAGER from Phase 2)
- accounting posting rules
- tax logic:

    Tax calculation uses Avalara AvaTax API
    Interface: { calculate(amount, currency, fromAddress, toAddress, lineItems, tenantId): TaxResult }
    Trigger: on invoice creation and PO generation
    WHT rules: Thailand default 3% services / 5% rent; TENANT_ADMIN configures other jurisdictions via finance.wht_rules (spec §13.3; consolidated from procurement.wht_rules by 20260822000001)

- vendor scoring/rating logic (3 criteria — see below)

Decisions in Phase 5 (documented in spec):

  VendorScoring:
    DECIDED: 3 scoring criteria — on-time delivery, quality, price competitiveness
    Weights: TENANT_ADMIN configures weights per criteria (default: equal 1/3 each)
    stored in vendor_score_weights table (tenant_id, criteria_name, weight DECIMAL(5,2))
    Interface: { score(vendorId: string, criteria: ScoreCriteria[]): VendorScore }
    ScoreCriteria: { name: 'on_time_delivery'|'quality'|'price', weight: number, value: number }
    VendorScore:   { vendorId: string, totalScore: number, breakdown: ScoreCriteria[], grade: ENUM(A,B,C,D,F) }
    Grade thresholds: A >= 90, B >= 75, C >= 60, D >= 45, F < 45

    HOW EACH CRITERION VALUE IS DERIVED (recorded 2026-08-23 — TDD OQ-26). The adapter takes the
    three values as INPUT and computes only the weighted sum; the derivation lives in
    ProcurementRepository and was previously written down nowhere, while vendor-scoring.ts still
    carried a note escalating it as UNSPECIFIED. The endpoint has been serving grades all along.

      on_time_delivery = deliveries received on or before (po.delivery_date + 2 days) / all deliveries
                         The 2-day grace is deliberate: a delivery note dated the day it left the
                         depot routinely lands the next working day, and counting that as late would
                         grade the logistics calendar rather than the vendor.
      quality          = 1 - (invoices with status DISPUTED / all invoices)
                         A PROXY, and the weakest of the three: it measures billing disputes, not
                         the condition of what arrived. It is what the platform records today —
                         there is no goods-inspection score to draw on. Treat a change here as a
                         change to what the grade MEANS.
      price            = mean over the vendor's quotations of
                         (lowest quote on that RFQ / this vendor's quote) x 100
                         100 = always the cheapest bid; 50 = consistently twice the best price.
                         Scored per RFQ, so it compares like with like rather than across baskets.

    Weights are re-normalised over the criteria that HAVE data: a vendor with no quotations is
    scored on the other two at 1/2 each rather than being penalised for an empty input. A vendor
    with no data at all returns grade = null, not F.

  WithholdingTaxRules (spec §13.3):
    DECIDED: Thailand default (3% services, 5% rent); TENANT_ADMIN configures other jurisdictions via finance.wht_rules
    Interface: { calculate(amount: Decimal, vendorType: string, jurisdiction: string): WHTResult }
    WHTResult: { whtAmount: Decimal, rate: number, certificateRef: string }
    Implementation: hook inside Avalara AvaTax flow

Constraints:

- Before marking Phase 5 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```
