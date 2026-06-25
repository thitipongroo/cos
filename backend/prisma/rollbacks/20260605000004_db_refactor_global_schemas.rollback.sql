-- Rollback: Global Schema Refactor + RLS
-- Reverses: 20260605000004_db_refactor_global_schemas/migration.sql
-- Run AFTER rolling back all migrations applied after this one.
--
-- Step 1: drop RLS policies and disable RLS on all tables that had policies added.
-- Step 2: move tables back from named schemas to public.
-- Step 3: drop named schemas created by this migration (projects, boq, procurement, site_ops).
--         finance, files, notifications schemas pre-existed — do NOT drop them here.

-- ─── Remove RLS: projects schema ─────────────────────────────────────────────

DROP POLICY IF EXISTS tenant_isolation ON projects.projects;
ALTER TABLE projects.projects DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON projects.project_members;
ALTER TABLE projects.project_members DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON projects.project_documents;
ALTER TABLE projects.project_documents DISABLE ROW LEVEL SECURITY;

-- ─── Remove RLS: boq schema ───────────────────────────────────────────────────

DROP POLICY IF EXISTS tenant_isolation ON boq.boq_versions;
ALTER TABLE boq.boq_versions DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON boq.boq_categories;
ALTER TABLE boq.boq_categories DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON boq.boq_items;
ALTER TABLE boq.boq_items DISABLE ROW LEVEL SECURITY;

-- ─── Remove RLS: procurement schema ──────────────────────────────────────────

DROP POLICY IF EXISTS tenant_isolation ON procurement.vendors;
ALTER TABLE procurement.vendors DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON procurement.purchase_requests;
ALTER TABLE procurement.purchase_requests DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON procurement.rfqs;
ALTER TABLE procurement.rfqs DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON procurement.quotations;
ALTER TABLE procurement.quotations DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON procurement.purchase_orders;
ALTER TABLE procurement.purchase_orders DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON procurement.po_line_items;
ALTER TABLE procurement.po_line_items DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON procurement.deliveries;
ALTER TABLE procurement.deliveries DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON procurement.delivery_items;
ALTER TABLE procurement.delivery_items DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON procurement.invoices;
ALTER TABLE procurement.invoices DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON procurement.vendor_score_weights;
ALTER TABLE procurement.vendor_score_weights DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON procurement.wht_rules;
ALTER TABLE procurement.wht_rules DISABLE ROW LEVEL SECURITY;

-- ─── Remove RLS: site_ops schema ─────────────────────────────────────────────

DROP POLICY IF EXISTS tenant_isolation ON site_ops.site_reports;
ALTER TABLE site_ops.site_reports DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON site_ops.issues;
ALTER TABLE site_ops.issues DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON site_ops.safety_checklists;
ALTER TABLE site_ops.safety_checklists DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON site_ops.inspections;
ALTER TABLE site_ops.inspections DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON site_ops.manpower_logs;
ALTER TABLE site_ops.manpower_logs DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON site_ops.conflict_records;
ALTER TABLE site_ops.conflict_records DISABLE ROW LEVEL SECURITY;

-- ─── Remove RLS: finance, files, notifications (pre-existing schemas) ─────────
-- These schemas existed before this migration; only RLS was added here.

DROP POLICY IF EXISTS tenant_isolation ON finance.project_budgets;
ALTER TABLE finance.project_budgets DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON finance.budget_lines;
ALTER TABLE finance.budget_lines DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON finance.cost_transactions;
ALTER TABLE finance.cost_transactions DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON finance.payments;
ALTER TABLE finance.payments DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON finance.retention_records;
ALTER TABLE finance.retention_records DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON files.files;
ALTER TABLE files.files DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON files.file_metadata;
ALTER TABLE files.file_metadata DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON notifications.notification_templates;
ALTER TABLE notifications.notification_templates DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON notifications.notifications;
ALTER TABLE notifications.notifications DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON notifications.notification_preferences;
ALTER TABLE notifications.notification_preferences DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON notifications.notification_device_tokens;
ALTER TABLE notifications.notification_device_tokens DISABLE ROW LEVEL SECURITY;

-- ─── Move tables back: projects → public ─────────────────────────────────────

ALTER TABLE projects.projects          SET SCHEMA public;
ALTER TABLE projects.project_members   SET SCHEMA public;
ALTER TABLE projects.project_documents SET SCHEMA public;
ALTER TABLE projects.outbox_events     SET SCHEMA public;

-- ─── Move tables back: boq → public ──────────────────────────────────────────

ALTER TABLE boq.boq_versions   SET SCHEMA public;
ALTER TABLE boq.boq_categories SET SCHEMA public;
ALTER TABLE boq.boq_items      SET SCHEMA public;

-- ─── Move tables back: procurement → public ──────────────────────────────────

ALTER TABLE procurement.vendors              SET SCHEMA public;
ALTER TABLE procurement.purchase_requests    SET SCHEMA public;
ALTER TABLE procurement.rfqs                 SET SCHEMA public;
ALTER TABLE procurement.quotations           SET SCHEMA public;
ALTER TABLE procurement.purchase_orders      SET SCHEMA public;
ALTER TABLE procurement.po_line_items        SET SCHEMA public;
ALTER TABLE procurement.deliveries           SET SCHEMA public;
ALTER TABLE procurement.delivery_items       SET SCHEMA public;
ALTER TABLE procurement.invoices             SET SCHEMA public;
ALTER TABLE procurement.vendor_score_weights SET SCHEMA public;
ALTER TABLE procurement.wht_rules            SET SCHEMA public;

-- ─── Move tables back: site_ops → public ─────────────────────────────────────

ALTER TABLE site_ops.site_reports      SET SCHEMA public;
ALTER TABLE site_ops.issues            SET SCHEMA public;
ALTER TABLE site_ops.safety_checklists SET SCHEMA public;
ALTER TABLE site_ops.inspections       SET SCHEMA public;
ALTER TABLE site_ops.manpower_logs     SET SCHEMA public;
ALTER TABLE site_ops.conflict_records  SET SCHEMA public;

-- ─── Drop schemas created by this migration ───────────────────────────────────
-- CASCADE is safe here: all tables have been moved back to public above.

DROP SCHEMA IF EXISTS projects    CASCADE;
DROP SCHEMA IF EXISTS boq         CASCADE;
DROP SCHEMA IF EXISTS procurement CASCADE;
DROP SCHEMA IF EXISTS site_ops    CASCADE;
