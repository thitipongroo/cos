-- Rollback for 20260706000003_file_retention_legal_hold (QM-9).

DROP TABLE IF EXISTS files.retention_policies;

DROP INDEX IF EXISTS files.files_category_idx;

ALTER TABLE files.files
  DROP COLUMN IF EXISTS legal_hold_at,
  DROP COLUMN IF EXISTS legal_hold_by,
  DROP COLUMN IF EXISTS legal_hold_reason,
  DROP COLUMN IF EXISTS legal_hold,
  DROP COLUMN IF EXISTS category;
