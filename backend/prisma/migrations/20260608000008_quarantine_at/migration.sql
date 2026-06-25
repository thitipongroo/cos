-- Phase 9: add quarantined_at to files.files
-- Tracks when a file was quarantined so the 30-day retention window starts from quarantine time,
-- not from upload time. Nullable: NULL for PENDING_SCAN and CLEAN files.
ALTER TABLE files.files ADD COLUMN quarantined_at TIMESTAMPTZ;
