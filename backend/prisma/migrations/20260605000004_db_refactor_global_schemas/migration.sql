-- ADR-008: Shared DB + tenant_id + RLS — global schema refactor
-- Moves project, boq, procurement, site_ops tables from public to named schemas.
-- Enables PostgreSQL Row Level Security on ALL domain tables.
-- Finance, files, notifications already in named schemas; add RLS policies only.
--
-- app.current_tenant_id is set per-transaction by TenantPrismaService before any query.
-- PostgreSQL RLS enforces tenant isolation at DB level (primary mechanism).
-- Application-layer WHERE tenant_id = $1 is secondary defense-in-depth.

-- ─── Create named schemas ─────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS projects;
CREATE SCHEMA IF NOT EXISTS boq;
CREATE SCHEMA IF NOT EXISTS procurement;
CREATE SCHEMA IF NOT EXISTS site_ops;

-- ─── Move tables: public → projects ──────────────────────────────────────────

ALTER TABLE public.projects            SET SCHEMA projects;
ALTER TABLE public.project_members     SET SCHEMA projects;
ALTER TABLE public.project_documents   SET SCHEMA projects;
ALTER TABLE public.outbox_events       SET SCHEMA projects;

-- ─── Move tables: public → boq ───────────────────────────────────────────────

ALTER TABLE public.boq_versions        SET SCHEMA boq;
ALTER TABLE public.boq_categories      SET SCHEMA boq;
ALTER TABLE public.boq_items           SET SCHEMA boq;

-- ─── Move tables: public → procurement ───────────────────────────────────────

ALTER TABLE public.vendors             SET SCHEMA procurement;
ALTER TABLE public.purchase_requests   SET SCHEMA procurement;
ALTER TABLE public.rfqs                SET SCHEMA procurement;
ALTER TABLE public.quotations          SET SCHEMA procurement;
ALTER TABLE public.purchase_orders     SET SCHEMA procurement;
ALTER TABLE public.po_line_items       SET SCHEMA procurement;
ALTER TABLE public.deliveries          SET SCHEMA procurement;
ALTER TABLE public.delivery_items      SET SCHEMA procurement;
ALTER TABLE public.invoices            SET SCHEMA procurement;
ALTER TABLE public.vendor_score_weights SET SCHEMA procurement;
ALTER TABLE public.wht_rules           SET SCHEMA procurement;

-- ─── Move tables: public → site_ops ──────────────────────────────────────────

ALTER TABLE public.site_reports        SET SCHEMA site_ops;
ALTER TABLE public.issues              SET SCHEMA site_ops;
ALTER TABLE public.safety_checklists   SET SCHEMA site_ops;
ALTER TABLE public.inspections         SET SCHEMA site_ops;
ALTER TABLE public.manpower_logs       SET SCHEMA site_ops;
ALTER TABLE public.conflict_records    SET SCHEMA site_ops;

-- ─── RLS: projects schema ─────────────────────────────────────────────────────

ALTER TABLE projects.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.projects FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON projects.projects AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

ALTER TABLE projects.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.project_members FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON projects.project_members AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

ALTER TABLE projects.project_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.project_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON projects.project_documents AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- outbox_events has no tenant_id — it is an internal relay table, no RLS.

-- ─── RLS: boq schema ─────────────────────────────────────────────────────────

ALTER TABLE boq.boq_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE boq.boq_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON boq.boq_versions AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

ALTER TABLE boq.boq_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE boq.boq_categories FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON boq.boq_categories AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

ALTER TABLE boq.boq_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE boq.boq_items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON boq.boq_items AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- ─── RLS: procurement schema ──────────────────────────────────────────────────

ALTER TABLE procurement.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.vendors FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON procurement.vendors AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

ALTER TABLE procurement.purchase_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.purchase_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON procurement.purchase_requests AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

ALTER TABLE procurement.rfqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.rfqs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON procurement.rfqs AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

ALTER TABLE procurement.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.quotations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON procurement.quotations AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

ALTER TABLE procurement.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.purchase_orders FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON procurement.purchase_orders AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

ALTER TABLE procurement.po_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.po_line_items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON procurement.po_line_items AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

ALTER TABLE procurement.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON procurement.deliveries AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

ALTER TABLE procurement.delivery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.delivery_items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON procurement.delivery_items AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

ALTER TABLE procurement.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON procurement.invoices AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

ALTER TABLE procurement.vendor_score_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.vendor_score_weights FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON procurement.vendor_score_weights AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

ALTER TABLE procurement.wht_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.wht_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON procurement.wht_rules AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- ─── RLS: site_ops schema ─────────────────────────────────────────────────────

ALTER TABLE site_ops.site_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_ops.site_reports FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON site_ops.site_reports AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

ALTER TABLE site_ops.issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_ops.issues FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON site_ops.issues AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

ALTER TABLE site_ops.safety_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_ops.safety_checklists FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON site_ops.safety_checklists AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

ALTER TABLE site_ops.inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_ops.inspections FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON site_ops.inspections AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

ALTER TABLE site_ops.manpower_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_ops.manpower_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON site_ops.manpower_logs AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

ALTER TABLE site_ops.conflict_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_ops.conflict_records FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON site_ops.conflict_records AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- ─── RLS: finance schema (already in named schema, add RLS) ──────────────────

ALTER TABLE finance.project_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.project_budgets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance.project_budgets AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

ALTER TABLE finance.budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.budget_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance.budget_lines AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

ALTER TABLE finance.cost_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.cost_transactions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance.cost_transactions AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

ALTER TABLE finance.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.payments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance.payments AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

ALTER TABLE finance.retention_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.retention_records FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance.retention_records AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- ─── RLS: files schema ───────────────────────────────────────────────────────

ALTER TABLE files.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE files.files FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON files.files AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

ALTER TABLE files.file_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE files.file_metadata FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON files.file_metadata AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- ─── RLS: notifications schema ────────────────────────────────────────────────
-- notification_templates: tenant_id IS NULL = system template; policy allows both.

ALTER TABLE notifications.notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications.notification_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notifications.notification_templates AS RESTRICTIVE
  USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid
  );

ALTER TABLE notifications.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications.notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notifications.notifications AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

ALTER TABLE notifications.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications.notification_preferences FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notifications.notification_preferences AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

ALTER TABLE notifications.notification_device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications.notification_device_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notifications.notification_device_tokens AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);
