-- Demo dataset for screenshot capture (docs/screens/*) and manual QA.
-- Reconstructs the DEMO-001 "Bangkok Tower — Phase 1" dataset that was previously
-- authored ad-hoc in a session scratchpad (now lost). Committed here so screen captures
-- are reproducible: `bash backend/prisma/apply-demo-seed.sh` after `pnpm seed`.
--
-- Tenant  : 00000000-0000-4000-8000-000000000001 (dev tenant from seed.ts)
-- Actor   : 00000000-0000-4000-8000-000000000012 (+66800000002, capture user)
-- Project : b0000000-0000-4000-8000-000000000001 (== capture.spec.ts PROJECT_ID)
--
-- Idempotent (ON CONFLICT DO NOTHING). Inserted as the DB owner (RLS-exempt); the GUC is
-- set anyway so it also works if run through a non-owner role.

-- set_config(..., false) == a session-level SET; spelled this way because sqlfluff's postgres
-- dialect cannot parse `SET <dotted.custom.guc>` and fails the lint gate on it.
SELECT set_config('app.current_tenant_id', '00000000-0000-4000-8000-000000000001', false);

-- ── Project ──────────────────────────────────────────────────────────────────
INSERT INTO projects.projects
(
    project_id, tenant_id, project_code, project_name, project_type, status,
    budget_amount, budget_currency, start_date, end_date, created_by
)
VALUES
(
    'b0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001',
    'DEMO-001', 'Bangkok Tower — Phase 1', 'COMMERCIAL', 'ACTIVE',
    5000000.0000, 'THB', DATE '2026-01-15', DATE '2026-12-31',
    '00000000-0000-4000-8000-000000000012'
)
ON CONFLICT (project_id) DO NOTHING;

-- ── BOQ (version → category → items) ─────────────────────────────────────────
INSERT INTO boq.boq_versions
(
    version_id, project_id, tenant_id, version_number, version_name, status,
    total_estimated_amount, total_estimated_currency, created_by
)
VALUES
(
    'b0000000-0000-4000-8000-000000000101', 'b0000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001', 1, 'Baseline BOQ', 'APPROVED',
    5000000.0000, 'THB', '00000000-0000-4000-8000-000000000012'
)
ON CONFLICT (version_id) DO NOTHING;

INSERT INTO boq.boq_categories
(category_id, version_id, tenant_id, category_code, category_name, sort_order, subtotal_amount)
VALUES
(
    'b0000000-0000-4000-8000-000000000102', 'b0000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000001', 'FOUNDATION', 'Foundation', 1, 3000000.0000
)
ON CONFLICT (category_id) DO NOTHING;

INSERT INTO boq.boq_items
(
    item_id, category_id, version_id, tenant_id, item_code, description, unit,
    quantity, unit_cost, estimated_total, currency_code, sort_order
)
VALUES
(
    'b0000000-0000-4000-8000-000000000103', 'b0000000-0000-4000-8000-000000000102',
    'b0000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001',
    'FND-001', 'Pour foundation — Zone A', 'm3', 500.0000, 4000.0000, 2000000.0000, 'THB', 1
),
(
    'b0000000-0000-4000-8000-000000000104', 'b0000000-0000-4000-8000-000000000102',
    'b0000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001',
    'FND-002', 'Install rebar — Level 2', 'ton', 40.0000, 25000.0000, 1000000.0000, 'THB', 2
)
ON CONFLICT (item_id) DO NOTHING;

-- ── Procurement (vendor → PR → RFQ → quotation → PO → delivery → invoice) ─────
INSERT INTO procurement.vendors
(vendor_id, tenant_id, vendor_code, vendor_name, tax_id, contact_email, contact_phone, is_active)
VALUES
(
    'b0000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000001',
    'VEN-001', 'Siam Cement Co., Ltd.', '0105536000000', 'sales@siamcement.co.th', '+6620000000', true
)
ON CONFLICT (vendor_id) DO NOTHING;

INSERT INTO procurement.purchase_requests
(pr_id, project_id, tenant_id, pr_number, status, requested_by, required_date)
VALUES
(
    'b0000000-0000-4000-8000-000000000301', 'b0000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001', 'PR-2026-001', 'PO_CREATED',
    '00000000-0000-4000-8000-000000000012', DATE '2026-07-20'
)
ON CONFLICT (pr_id) DO NOTHING;

INSERT INTO procurement.rfqs
(rfq_id, pr_id, project_id, tenant_id, rfq_number, status, deadline, created_by)
VALUES
(
    'b0000000-0000-4000-8000-000000000302', 'b0000000-0000-4000-8000-000000000301',
    'b0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001',
    'RFQ-2026-001', 'DRAFT', TIMESTAMPTZ '2026-07-25 00:00:00+07',
    '00000000-0000-4000-8000-000000000012'
)
ON CONFLICT (rfq_id) DO NOTHING;

INSERT INTO procurement.quotations
(quotation_id, rfq_id, vendor_id, tenant_id, total_amount, currency_code, validity_days, submitted_at, is_selected)
VALUES
(
    'b0000000-0000-4000-8000-000000000303', 'b0000000-0000-4000-8000-000000000302',
    'b0000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000001',
    250000.0000, 'THB', 30, TIMESTAMPTZ '2026-07-01 09:00:00+07', true
)
ON CONFLICT (quotation_id) DO NOTHING;

INSERT INTO procurement.purchase_orders
(
    po_id, rfq_id, vendor_id, project_id, tenant_id, po_number, status,
    total_amount, currency_code, delivery_date, created_by
)
VALUES
(
    'b0000000-0000-4000-8000-000000000304', 'b0000000-0000-4000-8000-000000000302',
    'b0000000-0000-4000-8000-000000000201', 'b0000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001', 'PO-2026-001', 'DRAFT',
    250000.0000, 'THB', DATE '2026-07-30', '00000000-0000-4000-8000-000000000012'
)
ON CONFLICT (po_id) DO NOTHING;

INSERT INTO procurement.deliveries
(delivery_id, po_id, tenant_id, delivery_note, delivered_at, received_by, notes)
VALUES
(
    'b0000000-0000-4000-8000-000000000305', 'b0000000-0000-4000-8000-000000000304',
    '00000000-0000-4000-8000-000000000001', 'DN-2026-001', TIMESTAMPTZ '2026-07-05 14:00:00+07',
    '00000000-0000-4000-8000-000000000012', 'Partial delivery — 50%'
)
ON CONFLICT (delivery_id) DO NOTHING;

INSERT INTO procurement.invoices
(
    invoice_id, po_id, vendor_id, tenant_id, invoice_number, amount, currency_code,
    invoice_date, due_date, status
)
VALUES
(
    'b0000000-0000-4000-8000-000000000306', 'b0000000-0000-4000-8000-000000000304',
    'b0000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000001',
    'INV-2026-001', 125000.0000, 'THB', DATE '2026-07-05', DATE '2026-08-04', 'RECEIVED'
)
ON CONFLICT (invoice_id) DO NOTHING;

-- ── Finance (budget → budget line → payment) ─────────────────────────────────
INSERT INTO finance.project_budgets
(
    budget_id, project_id, tenant_id, total_budget_amount, total_budget_currency,
    allocated_amount, committed_amount, actual_amount, variance_alert_threshold
)
VALUES
(
    'b0000000-0000-4000-8000-000000000401', 'b0000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001', 5000000.0000, 'THB',
    3000000.0000, 250000.0000, 125000.0000, 10.00
)
ON CONFLICT (budget_id) DO NOTHING;

INSERT INTO finance.budget_lines
(line_id, budget_id, project_id, tenant_id, boq_category_id, line_name, allocated_amount, currency_code)
VALUES
(
    'b0000000-0000-4000-8000-000000000402', 'b0000000-0000-4000-8000-000000000401',
    'b0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000102', 'Foundation', 3000000.0000, 'THB'
)
ON CONFLICT (line_id) DO NOTHING;

INSERT INTO finance.payments
(payment_id, invoice_id, project_id, tenant_id, amount, currency_code, payment_date, status, recorded_by)
VALUES
(
    'b0000000-0000-4000-8000-000000000403', 'b0000000-0000-4000-8000-000000000306',
    'b0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001',
    125000.0000, 'THB', DATE '2026-07-06', 'PENDING', '00000000-0000-4000-8000-000000000012'
)
ON CONFLICT (payment_id) DO NOTHING;

-- ── Tasks ────────────────────────────────────────────────────────────────────
-- Both tasks carry planned dates and real progress so the Site Engineer Home's progress card has
-- something to compute (§32.12): it weights progress_percent by the linked BOQ item's
-- estimated_total, and derives the schedule verdict from where each task should be today.
--   foundation : weight 2,000,000 (FND-001), 85% done, planned 2026-01-15 → 2026-09-30
--   rebar      : weight 1,000,000 (FND-002), 30% done, planned 2026-06-01 → 2026-11-30
-- → earned 66.7%, planned ~55.3% as of 2026-07-16, SPI ~1.21 → "ahead". The figures move with the
-- date (planned% is interpolated against now()), which is inherent to a live metric; the margin over
-- the 1.05 band edge is wide enough that the verdict is stable across a normal capture window.
-- Both are IN_PROGRESS with an actual_start: progress > 0 on a NOT_STARTED task is incoherent data
-- and would render as such on the tasks screen.
INSERT INTO projects.tasks
(
    task_id, tenant_id, project_id, task_name, work_type, status, boq_item_id,
    progress_percent, qc_status, planned_start, planned_end, actual_start
)
VALUES
(
    'b0000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001', 'Pour foundation — Zone A', 'FOUNDATION',
    'IN_PROGRESS', 'b0000000-0000-4000-8000-000000000103', 85, 'NONE',
    DATE '2026-01-15', DATE '2026-09-30', DATE '2026-01-20'
),
(
    'b0000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001', 'Install rebar — Level 2', 'STRUCTURE',
    'IN_PROGRESS', 'b0000000-0000-4000-8000-000000000104', 30, 'NONE',
    DATE '2026-06-01', DATE '2026-11-30', DATE '2026-06-03'
)
ON CONFLICT (task_id) DO NOTHING;

-- ── Project phases (ADR-070) ───────────────────────────────────────────────────
-- The construction execution stages the SITE_ENGINEER dashboard's phase card reads. status is PM-set
-- (phases are not linked to tasks in this increment) and kept coherent with the tasks above: the
-- foundation formwork is still ~60–85% and the Level-2 rebar has just started, so Foundation and
-- Structure are both IN_PROGRESS. The DERIVED current phase — the lowest-seq IN_PROGRESS one — is
-- Foundation (ADR-070). actual_end is NULL on both (only COMPLETED phases are signed off).
INSERT INTO projects.project_phases
(
    phase_id, project_id, tenant_id, seq, name, status,
    planned_start, planned_end, actual_start, actual_end, created_by
)
VALUES
(
    'b0000000-0000-4000-8000-000000000801', 'b0000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001', 1, 'Foundation', 'IN_PROGRESS',
    DATE '2026-01-15', DATE '2026-04-30', DATE '2026-01-20', null,
    '00000000-0000-4000-8000-000000000012'
),
(
    'b0000000-0000-4000-8000-000000000802', 'b0000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001', 2, 'Structure', 'IN_PROGRESS',
    DATE '2026-04-15', DATE '2026-08-31', DATE '2026-06-01', null,
    '00000000-0000-4000-8000-000000000012'
),
(
    'b0000000-0000-4000-8000-000000000803', 'b0000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001', 3, 'MEP', 'NOT_STARTED',
    DATE '2026-08-01', DATE '2026-10-31', null, null,
    '00000000-0000-4000-8000-000000000012'
),
(
    'b0000000-0000-4000-8000-000000000804', 'b0000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001', 4, 'Architecture', 'NOT_STARTED',
    DATE '2026-10-15', DATE '2026-12-15', null, null,
    '00000000-0000-4000-8000-000000000012'
),
(
    'b0000000-0000-4000-8000-000000000805', 'b0000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001', 5, 'Handover', 'NOT_STARTED',
    DATE '2026-12-10', DATE '2026-12-31', null, null,
    '00000000-0000-4000-8000-000000000012'
)
ON CONFLICT (phase_id) DO NOTHING;

-- ── Site reports ─────────────────────────────────────────────────────────────
INSERT INTO site_ops.site_reports
(report_id, project_id, tenant_id, report_date, submitted_by, status, summary, weather, manpower_count)
VALUES
(
    'b0000000-0000-4000-8000-000000000601', 'b0000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001', DATE '2026-07-04',
    '00000000-0000-4000-8000-000000000012', 'DRAFT',
    'Foundation formwork 60% complete. Rebar delivery expected tomorrow.', 'Partly cloudy', 24
),
(
    'b0000000-0000-4000-8000-000000000602', 'b0000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001', DATE '2026-07-03',
    '00000000-0000-4000-8000-000000000012', 'DRAFT',
    'Site cleared. Excavation for Zone A footings completed.', 'Sunny', 18
)
ON CONFLICT (report_id) DO NOTHING;

-- ── Issues ───────────────────────────────────────────────────────────────────
INSERT INTO site_ops.issues
(issue_id, project_id, tenant_id, report_id, title, description, severity, status, issue_type)
VALUES
(
    'b0000000-0000-4000-8000-000000000701', 'b0000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000601',
    'Water leak in basement — Zone B', 'Groundwater seepage observed at the north wall.',
    'MEDIUM', 'OPEN', 'DEFECT'
),
(
    'b0000000-0000-4000-8000-000000000702', 'b0000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000602',
    'Delayed concrete delivery', 'Supplier pushed the pour date by one day.',
    'LOW', 'OPEN', 'GENERAL'
)
ON CONFLICT (issue_id) DO NOTHING;

-- ── Inspection (so the offline-inspection E2E has a DEMO-001 item to open) ─────
INSERT INTO site_ops.inspections
(inspection_id, project_id, tenant_id, checklist_id, status, inspected_by, inspected_at, notes)
VALUES
(
    'b0000000-0000-4000-8000-000000000801', 'b0000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000051', 'PENDING',
    '00000000-0000-4000-8000-000000000012', now(), 'DEMO-001 inspection for e2e'
)
ON CONFLICT (inspection_id) DO NOTHING;
