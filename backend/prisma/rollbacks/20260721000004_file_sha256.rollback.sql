-- Rollback: file content SHA-256 (ADR-058 CT-3).
ALTER TABLE files.files DROP COLUMN IF EXISTS sha256;
