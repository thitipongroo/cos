-- Phase 9 — retention policies (per-tenant, per-category) + per-file legal hold (WORM).
-- PO decision: auto soft-delete on retention expiry → existing 30-day hard-delete grace;
-- legal hold blocks ALL deletion (soft + hard). category is derived from mime_type and stored
-- so retention policies can be matched by a single indexed join.

-- ─── files.files: category + per-file legal hold ────────────────────────────
ALTER TABLE files.files
  ADD COLUMN category          VARCHAR(50),
  ADD COLUMN legal_hold        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN legal_hold_reason TEXT,
  ADD COLUMN legal_hold_by     UUID,
  ADD COLUMN legal_hold_at     TIMESTAMPTZ;

-- Backfill category for existing rows (mirrors util/category.ts).
UPDATE files.files SET category = CASE
  WHEN mime_type IN ('image/jpeg','image/png','image/webp','image/gif') THEN 'image'
  WHEN mime_type IN ('application/pdf','application/vnd.ms-excel',
                     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') THEN 'document'
  WHEN mime_type IN ('application/dxf','application/acad','image/vnd.dwg') THEN 'cad'
  WHEN mime_type IN ('video/mp4','video/quicktime','video/webm',
                     'video/x-msvideo','video/x-ms-wmv') THEN 'video'
  WHEN mime_type = 'application/zip' THEN 'archive'
  ELSE 'other'
END;

CREATE INDEX files_category_idx ON files.files (tenant_id, category);

-- ─── files.retention_policies ───────────────────────────────────────────────
CREATE TABLE files.retention_policies (
  policy_id      UUID        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL,
  category       VARCHAR(50) NOT NULL,
  retention_days INTEGER     NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT retention_policies_pkey          PRIMARY KEY (policy_id),
  CONSTRAINT retention_policies_tenant_cat_uq UNIQUE (tenant_id, category),
  CONSTRAINT retention_policies_days_chk      CHECK (retention_days > 0)
);

ALTER TABLE files.retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE files.retention_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON files.retention_policies AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);
