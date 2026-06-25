-- Phase 9: File Service
-- Creates the "files" schema with files and file_metadata tables.
-- Backward-compatible: adds new schema and tables, no modifications to existing schemas.

CREATE SCHEMA IF NOT EXISTS files;

-- ─── Enums ────────────────────────────────────────────────────────────────

CREATE TYPE files."FileStatus" AS ENUM (
  'PENDING_SCAN',
  'CLEAN',
  'QUARANTINED'
);

-- ─── files.files ──────────────────────────────────────────────────────────

CREATE TABLE files.files (
  file_id           UUID         NOT NULL DEFAULT gen_random_uuid(),
  tenant_id         UUID         NOT NULL,
  -- @pdpa(category: "operational") — original_filename may contain personal data
  original_filename VARCHAR(512) NOT NULL,
  stored_key        VARCHAR(1024) NOT NULL,
  bucket_name       VARCHAR(255) NOT NULL,
  mime_type         VARCHAR(255) NOT NULL,
  file_size_bytes   BIGINT       NOT NULL,
  file_status       files."FileStatus" NOT NULL DEFAULT 'PENDING_SCAN',
  uploaded_by       UUID         NOT NULL,
  uploaded_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,

  CONSTRAINT files_pkey PRIMARY KEY (file_id)
);

CREATE INDEX files_tenant_uploader_idx ON files.files (tenant_id, uploaded_by);
CREATE INDEX files_tenant_status_idx   ON files.files (tenant_id, file_status);

-- ─── files.file_metadata ──────────────────────────────────────────────────

CREATE TABLE files.file_metadata (
  metadata_id    UUID         NOT NULL DEFAULT gen_random_uuid(),
  file_id        UUID         NOT NULL,
  tenant_id      UUID         NOT NULL,
  entity_type    VARCHAR(100),
  entity_id      UUID,
  metadata_key   VARCHAR(255) NOT NULL,
  metadata_value TEXT,

  CONSTRAINT file_metadata_pkey    PRIMARY KEY (metadata_id),
  CONSTRAINT file_metadata_file_fk FOREIGN KEY (file_id) REFERENCES files.files(file_id)
);

CREATE INDEX file_metadata_file_idx   ON files.file_metadata (file_id);
CREATE INDEX file_metadata_entity_idx ON files.file_metadata (entity_type, entity_id);
