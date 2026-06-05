-- Rollback: Phase 9 File Service migration
-- Removes the "files" schema and all its objects.
-- WARNING: This will permanently delete all file metadata records.
-- Only run after confirming all files have been migrated or data loss is acceptable.

DROP SCHEMA IF EXISTS files CASCADE;
