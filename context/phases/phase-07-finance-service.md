# Phase 7 — Finance Service

> Moved out of `context/00_master_construction_os.md` on 2026-09-02, verbatim.
> That file keeps the index row pointing here; `.claude/skills/phase-index/SKILL.md`
> is the map. Depends on Phase 4, 5 · SaaS Maturity Stage 2.
>
> Rule 36 applies at the end of this phase and Rule 38 before it starts.

```text
Build Finance Service.

IMPORTANT SCOPE CLARIFICATION:
  This service is a PROJECT COST TRACKING system, NOT a full accounting system.
  It does NOT implement double-entry bookkeeping.
  It does NOT implement chart of accounts.
  It does NOT implement GL posting.
  It does NOT integrate with external ERP or accounting software.
  All of the above are UNSPECIFIED — escalate to product owner for decision; do not generate stubs.

  What it DOES implement:
  - Project-level budget tracking (budget vs actual cost)
  - Cost transaction recording (inbound from Procurement via Kafka)
  - Payment status tracking
  - Budget variance reporting
  - Project-level financial summary views
  - AR Client Billing (§11/§15): create → approve (Finance → PM ≤ limit → Executive) → paid
  - AR Receipts (client payments; settle billing to PAID) + Contracts + Customers (§11)
  - Cash Flow Forecast — deterministic 13-week direct method (ADR-024; §09 AI forecast deferred)
  - Client contract signing (e-signature) — bilateral PKI/VC via CredentialService (§5.4); contractor
    authorized-role signs directly + client signs via magic-link (ADR-030); contract document uploaded OR
    generated in-app; status → signed when both signatures verify → emit ContractSigned (ADR-058; §11 ContractSignature)

Financial Precision: follow FINANCIAL PRECISION SPEC section above.

Entities (PostgreSQL — schema: finance):
  project_budgets:
    budget_id         UUID PK
    project_id        UUID NOT NULL UNIQUE
    tenant_id         UUID NOT NULL
    total_budget_amount   DECIMAL(19,4) NOT NULL
    total_budget_currency VARCHAR(3) NOT NULL
    allocated_amount  DECIMAL(19,4) DEFAULT 0   — sum of budget_lines
    committed_amount  DECIMAL(19,4) DEFAULT 0   — sum of approved POs
    actual_amount     DECIMAL(19,4) DEFAULT 0   — sum of paid invoices
    created_at        TIMESTAMPTZ DEFAULT now()
    updated_at        TIMESTAMPTZ DEFAULT now()

  budget_lines:
    line_id           UUID PK
    budget_id         UUID FK NOT NULL
    project_id        UUID NOT NULL
    tenant_id         UUID NOT NULL
    boq_category_id   UUID     — loose reference to BOQ category (no FK)
    line_name         VARCHAR(255) NOT NULL
    allocated_amount  DECIMAL(19,4) NOT NULL
    currency_code     VARCHAR(3) NOT NULL
    created_at        TIMESTAMPTZ DEFAULT now()

  cost_transactions:
    transaction_id    UUID PK
    project_id        UUID NOT NULL
    tenant_id         UUID NOT NULL
    source_type       ENUM('PURCHASE_ORDER','INVOICE','ADJUSTMENT') NOT NULL
    source_id         UUID NOT NULL  — PO ID or Invoice ID from Procurement
    budget_line_id    UUID FK (nullable — manual assignment)
    amount            DECIMAL(19,4) NOT NULL
    currency_code     VARCHAR(3) NOT NULL
    transaction_date  DATE NOT NULL
    description       TEXT
    recorded_at       TIMESTAMPTZ DEFAULT now()
    recorded_by       UUID  — actor_id from event, or user for manual entry
    INDEX: (project_id, tenant_id, transaction_date)

  payments:
    payment_id        UUID PK
    invoice_id        UUID NOT NULL  — from Procurement
    project_id        UUID NOT NULL
    tenant_id         UUID NOT NULL
    amount            DECIMAL(19,4) NOT NULL
    currency_code     VARCHAR(3) NOT NULL
    payment_date      DATE NOT NULL
    payment_reference VARCHAR(255)
    status            ENUM('PENDING','PROCESSED','FAILED')
    recorded_by       UUID NOT NULL
    created_at        TIMESTAMPTZ DEFAULT now()

  retention_records:
    retention_id      UUID PK
    po_id             UUID NOT NULL
    project_id        UUID NOT NULL
    tenant_id         UUID NOT NULL
    retention_percentage DECIMAL(5,2)  — set by TENANT_ADMIN per PO (nullable; no system default)
    retention_amount  DECIMAL(19,4)  — calculated: contract_amount × retention_percentage / 100
    currency_code     VARCHAR(3)
    status            ENUM('HELD','RELEASED','PARTIAL_RELEASE')
    — DECIDED: retention_percentage is entered by TENANT_ADMIN per PO in UI; no automatic calculation

Kafka Consumers (Finance subscribes to these events):
  procurement.po.created         → create cost_transaction (COMMITTED, source: PO)
  procurement.invoice.received   → create cost_transaction (ACTUAL, source: INVOICE)
  procurement.po.status_changed  → update committed_amount if PO CANCELLED

APIs (canonical prefix /api/v1/finance/*; spec §14 Financial APIs; AIP-132; see ADR-023.
  Budget is project-scoped; cost-transactions and payments are tenant-wide lists filterable
  by ?project_id=. Vendor invoices (AP) live in procurement /api/v1/procurement/vendor-invoices
  — Finance views/approves/pays them; no duplicate finance invoice store):
  GET  /api/v1/finance/budget/:projectId              — budget summary with lines (vs actual/committed)
  POST /api/v1/finance/budget/:projectId              — create/update budget
  POST /api/v1/finance/budget/:projectId/lines        — add budget line
  GET  /api/v1/finance/cost-transactions              — list cost transactions (tenant-wide; ?project_id=)
  POST /api/v1/finance/payments                       — record payment vs vendor invoice (project_id in body)
  GET  /api/v1/finance/payments                       — list payments / AP queue (tenant-wide; ?project_id=)
  GET  /api/v1/finance/reports/variance               — budget variance across projects
  POST /api/v1/finance/customers                       — register a client/customer (§11)
  GET  /api/v1/finance/customers                       — list customers
  POST /api/v1/finance/contracts                       — create a contract (client-/vendor-side, §11)
  GET  /api/v1/finance/contracts                       — list contracts (tenant-wide; ?project_id=)
  POST /api/v1/finance/contracts/:id/document          — attach contract doc (upload|generate) (ADR-058)
  POST /api/v1/finance/contracts/:id/sign              — contractor-side PKI/VC signature (ADR-058)
  POST /api/v1/finance/contracts/:id/sign-links        — issue client magic-link to sign (ADR-058)
  POST /api/v1/finance/contracts/sign/:token           — external client signs via magic-link (tenant-mw excluded)
  GET  /api/v1/finance/contracts/:id/signatures        — signature audit trail (ADR-058)
  POST /api/v1/finance/billing                         — create AR client billing (DRAFT)
  GET  /api/v1/finance/billing                         — list AR billings (tenant-wide; ?project_id=&status=)
  GET  /api/v1/finance/billing/:billingId              — get a single AR billing
  PATCH /api/v1/finance/billing/:billingId/approve     — approve billing DRAFT→ISSUED (§15: PM≤limit, Exec above)
  POST /api/v1/finance/ar-receipts                     — record client payment; settles billing → PAID (§11)
  GET  /api/v1/finance/cashflow-forecast/:projectId    — 13-week direct-method cash flow forecast (ADR-024)

Generate:

- PostgreSQL migration files for all entities
- NestJS module with Kafka consumer handlers for procurement events
- Budget aggregation service (recalculates on each transaction)
- Variance calculation: (actual + committed) vs allocated, per PROJECT.
  Corrected 2026-08-22: this line used to read "per budget_line". Finance cannot attribute a cost to
  a budget line with anything the specs give it — the Event Contract (spec `32 §Event payloads`,
  rows 3 and 4) defines `procurement.po.created.v1` and `procurement.invoice.received.v1` with no
  `boq_item_id` and no budget-line reference, and the Constraints below forbid Finance from querying
  Procurement's tables directly. `cost_transactions.budget_line_id` above stays as declared, a
  nullable column for manual assignment; no spec file defines an endpoint that performs that
  assignment, so nothing populates it today and a per-line figure would read 0.0000 for every line
  in every project.
  To make per-line variance real, the Event Contract has to carry the attribution first — that is a
  change to spec 32 and to Procurement's emitter (a new event version), not something the Finance
  service can derive on its own.
- Decimal.js used for all calculations
- DTOs with validation
- OpenAPI 3.1 spec
- Client contract signing (ADR-058): ContractSignature migration (§11) + Contract.signed_document_id;
  endpoints /contracts/:id/document|sign|sign-links + /contracts/sign/:token (magic-link, tenant-mw
  excluded, ADR-030) + /contracts/:id/signatures; PKI/VC via CredentialService (§5.4); document upload OR
  in-app generation; signed when both INTERNAL+CLIENT signatures verify → emit ContractSigned (§16);
  signature rows + document hash to WORM audit (§9); data classification RESTRICTED
- Unit tests: aggregation accuracy, Kafka consumer handlers
- Integration tests: full budget lifecycle + procurement event consumption
- Kafka event producers:

    finance.budget.created   { project_id, budget_id, total_budget_amount }
    finance.payment.processed { project_id, payment_id, invoice_id, amount }
    finance.variance.alert   { project_id, variance_percentage, threshold_exceeded }
      — DECIDED: default threshold = 10% (fires when actual cost exceeds budget by 10%)
        TENANT_ADMIN can override per project via project settings; stored in project_budgets.variance_alert_threshold DECIMAL(5,2)

Constraints:

- Do NOT implement double-entry bookkeeping
- Do NOT implement chart of accounts
- Tax calculation: implement via Avalara AvaTax API

    Avalara handles VAT, GST, Sales Tax globally — pluggable per tenant jurisdiction
    WHT (Withholding Tax): Thailand default (3% services, 5% rent); TENANT_ADMIN configures per jurisdiction (spec §13.3)
    Do NOT hardcode tax rates — use finance.wht_rules for all jurisdictions (the only WHT table; procurement.wht_rules was dropped 2026-08-22)

- ERP integration: Strategy pattern; 3 sub-stubs (SAPAdapter, OracleAdapter, DynamicsAdapter); implement each when first tenant with that ERP onboards (spec §13.3)
- Multi-currency conversion: implement via Open Exchange Rates API

    Rates cached in Redis TTL 24h, refreshed daily at 00:00 UTC
    Fallback: use last cached rate if API unavailable (stale-while-revalidate)
    Do NOT implement custom exchange rate logic

- All cross-service data arrives via Kafka — no direct DB queries to Procurement

    ONE EXCEPTION (decided 2026-08-23, TDD OQ-31): the reconciliation sweep,
    LedgerReconciliationService. A ledger derived from a stream cannot detect its own
    gaps — the outbox is durable, not transactional (ADR-094), so a dropped
    procurement.po.created.v1 leaves the budget silently under-committed and nothing in
    the system disagrees with anything else. The sweep compares
    finance.cost_transactions against procurement.purchase_orders / procurement.invoices
    hourly and reports three drift kinds (missing / duplicate / orphan) via
    finance_ledger_drift (spec 31 §31.3) plus a `finance.ledger.drift` error log.

    The exception is narrow and the shape of the service is the boundary:
      - READ ONLY — identity + amount columns only. Enforced by test.
      - Never feeds a request, an API response, or a business decision. Output is a log
        line and a gauge.
      - Never WRITES a cost transaction. Repair is re-publishing the missing event, so
        FinanceConsumer stays the single writer and the ledger stays replayable.
    Anything beyond this — reading Procurement to answer a query, to fill a report, or to
    make a decision — is still forbidden.

Decisions in Phase 7 (documented in spec):

  ERPIntegration (spec §13.3):
    DECIDED: Strategy pattern — common ERPIntegration interface { postCostTransaction, postInvoice, syncVendor }
    3 sub-stubs (each STUB until first customer with that ERP onboards):
      SAPAdapter:      SAP Business One / S/4HANA (webhook + iDoc format)
      OracleAdapter:   Oracle Fusion Finance (REST API)
      DynamicsAdapter: Microsoft Dynamics 365 Finance (REST API)
    Implementation: per-source adapter; credentials stored per-tenant in AWS SM / Vault

  ConstructionFinancing (spec §13.5):
    DECIDED: Invoice factoring (AR factoring); COS exports invoice data → fintech partner API; Strategy pattern — per-partner adapter
    Interface: { submitFactoringApplication(invoiceId, tenantId): Promise<FinancingRef> }
    Data export to fintech: verified invoices (invoice.status = VERIFIED), cash flow data
    Candidates: Funding Societies (SEA), Validus (SEA) — per-partner adapter implemented on first tenant request

- Before marking Phase 7 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36
```
