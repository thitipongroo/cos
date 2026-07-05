-- Rollback for 20260706000002_file_archive_extraction (QM-9).

DROP INDEX IF EXISTS files.files_parent_idx;

ALTER TABLE files.files
  DROP CONSTRAINT IF EXISTS files_parent_fk,
  DROP COLUMN IF EXISTS parent_file_id,
  DROP COLUMN IF EXISTS extracted_at,
  DROP COLUMN IF EXISTS is_archive;
