-- Rollback: remove quarantined_at from files.files
ALTER TABLE files.files DROP COLUMN IF EXISTS quarantined_at;
