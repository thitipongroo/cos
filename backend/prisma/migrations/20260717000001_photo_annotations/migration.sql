-- Photo annotations (ADR-056; 17-offline-mobile-sync §17.5; 11-database-schema §11.5).
--
-- Re-editable markup on a photo. The stroke list is retained-mode with NORMALISED (0..1)
-- coordinates so one list renders at any resolution; the flattened marked-up image is a separate
-- files.files row, never stored here. `version` is the concurrency token behind CONFLICT_FLAGGED:
-- an offline edit carries the base version it read, and on sync a mismatch means someone else edited
-- the same photo, so the write is flagged for SITE_ENGINEER review rather than merged or overwritten.

CREATE TABLE IF NOT EXISTS files.photo_annotations (
  annotation_id UUID        NOT NULL DEFAULT gen_random_uuid(),
  -- The photo being marked up. One annotation row per photo.
  file_id       UUID        NOT NULL REFERENCES files.files (file_id),
  tenant_id     UUID        NOT NULL,
  -- Retained-mode stroke list; coordinates NORMALISED 0..1. Never a flattened raster.
  strokes       JSONB       NOT NULL,
  -- Concurrency token: bumped on every save; a base-version mismatch on sync is the conflict.
  version       INTEGER     NOT NULL DEFAULT 1,
  modified_by   UUID        NOT NULL,
  modified_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Soft delete per §11.4; NULL = active.
  deleted_at    TIMESTAMPTZ,

  CONSTRAINT photo_annotations_pkey PRIMARY KEY (annotation_id),
  -- One annotation per photo (per tenant, guaranteed by tenant_id on the file too).
  CONSTRAINT photo_annotations_file_key UNIQUE (file_id)
);

CREATE INDEX IF NOT EXISTS idx_photo_annotations_tenant ON files.photo_annotations (tenant_id);

-- Tenant isolation — the standard rls_tenant_isolation applied to every domain table carrying a
-- tenant_id (§11.0 template; 20260608000004_rls_policies). Spelled out here rather than left to a
-- replay: ENABLE without a policy would deny app_user everything.
ALTER TABLE files.photo_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE files.photo_annotations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_tenant_isolation ON files.photo_annotations;

CREATE POLICY rls_tenant_isolation ON files.photo_annotations
  AS PERMISSIVE
  FOR ALL
  TO app_user
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid);
