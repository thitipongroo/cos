-- Phase 6: Site Operations Service
-- Creates: site_reports, issues, inspections, safety_checklists, manpower_logs, conflict_records
-- Offline sync fields: client_submitted_at, modified_at support ConflictHandler strategies.
-- Backward-compatible: new tables only, no modification to existing tables.
-- Rollback: migrations/rollbacks/20260604000003_phase6_site_operations.rollback.sql

-- ─── site_reports ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_reports (
  report_id           UUID        NOT NULL DEFAULT gen_random_uuid(),
  project_id          UUID        NOT NULL,
  tenant_id           UUID        NOT NULL,
  report_date         DATE        NOT NULL,
  submitted_by        UUID        NOT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                        CHECK (status IN ('DRAFT','SUBMITTED','ACKNOWLEDGED')),
  summary             TEXT,
  weather             VARCHAR(100),
  manpower_count      INTEGER,
  client_submitted_at TIMESTAMPTZ,
  server_received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  modified_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT site_reports_pkey PRIMARY KEY (report_id),
  CONSTRAINT uq_site_reports_project_date_user
    UNIQUE (project_id, report_date, submitted_by)
);

CREATE INDEX IF NOT EXISTS idx_site_reports_project_tenant
  ON site_reports (project_id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_site_reports_date
  ON site_reports (report_date DESC);

-- ─── issues ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS issues (
  issue_id            UUID        NOT NULL DEFAULT gen_random_uuid(),
  project_id          UUID        NOT NULL,
  tenant_id           UUID        NOT NULL,
  report_id           UUID,
  title               VARCHAR(255) NOT NULL,
  description         TEXT,
  severity            VARCHAR(10) NOT NULL DEFAULT 'LOW'
                        CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  status              VARCHAR(15) NOT NULL DEFAULT 'OPEN'
                        CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')),
  assigned_to         UUID,
  resolution_note     TEXT,
  client_submitted_at TIMESTAMPTZ,
  modified_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT issues_pkey PRIMARY KEY (issue_id)
);

CREATE INDEX IF NOT EXISTS idx_issues_project_tenant
  ON issues (project_id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_issues_status_severity
  ON issues (status, severity);

-- ─── safety_checklists ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS safety_checklists (
  checklist_id   UUID         NOT NULL DEFAULT gen_random_uuid(),
  project_id     UUID         NOT NULL,
  tenant_id      UUID         NOT NULL,
  checklist_name VARCHAR(255) NOT NULL,
  version        INTEGER      NOT NULL DEFAULT 1,
  items          JSONB        NOT NULL DEFAULT '[]',
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT safety_checklists_pkey PRIMARY KEY (checklist_id)
);

CREATE INDEX IF NOT EXISTS idx_safety_checklists_project
  ON safety_checklists (project_id, tenant_id);

-- ─── inspections ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inspections (
  inspection_id UUID        NOT NULL DEFAULT gen_random_uuid(),
  project_id    UUID        NOT NULL,
  tenant_id     UUID        NOT NULL,
  checklist_id  UUID        NOT NULL,
  status        VARCHAR(25) NOT NULL
                  CHECK (status IN ('PENDING','PASSED','FAILED','REQUIRES_REINSPECTION')),
  inspected_by  UUID        NOT NULL,
  inspected_at  TIMESTAMPTZ NOT NULL,
  notes         TEXT,

  CONSTRAINT inspections_pkey PRIMARY KEY (inspection_id)
);

CREATE INDEX IF NOT EXISTS idx_inspections_project_tenant
  ON inspections (project_id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_inspections_checklist
  ON inspections (checklist_id);

-- ─── manpower_logs ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS manpower_logs (
  log_id        UUID           NOT NULL DEFAULT gen_random_uuid(),
  report_id     UUID           NOT NULL,
  tenant_id     UUID           NOT NULL,
  trade_type    VARCHAR(100)   NOT NULL,
  worker_count  INTEGER        NOT NULL,
  hours_worked  DECIMAL(5,2)   NOT NULL,

  CONSTRAINT manpower_logs_pkey PRIMARY KEY (log_id),
  CONSTRAINT fk_manpower_logs_report
    FOREIGN KEY (report_id) REFERENCES site_reports (report_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_manpower_logs_report
  ON manpower_logs (report_id);

-- ─── conflict_records ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conflict_records (
  conflict_id    UUID         NOT NULL DEFAULT gen_random_uuid(),
  tenant_id      UUID         NOT NULL,
  entity_type    VARCHAR(100) NOT NULL,
  entity_id      UUID         NOT NULL,
  client_payload JSONB        NOT NULL,
  server_payload JSONB        NOT NULL,
  conflict_type  VARCHAR(20)  NOT NULL
                   CHECK (conflict_type IN ('FIELD_CONFLICT','STATUS_CONFLICT','REJECTED')),
  reviewed_by    UUID,
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT conflict_records_pkey PRIMARY KEY (conflict_id)
);

CREATE INDEX IF NOT EXISTS idx_conflict_records_tenant_entity
  ON conflict_records (tenant_id, entity_id);

CREATE INDEX IF NOT EXISTS idx_conflict_records_unreviewed
  ON conflict_records (tenant_id, reviewed_at)
  WHERE reviewed_at IS NULL;
