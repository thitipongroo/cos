-- Phase 9 — bulk ZIP upload extraction (PO decision: async sandboxed extraction).
-- An uploaded archive is kept as an EXTRACTED record (audit trail); each entry becomes a
-- child file row linked via parent_file_id.
-- Backward-compatible: additive columns with safe defaults, no data migration needed.

ALTER TABLE files.files
  ADD COLUMN is_archive     BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN extracted_at   TIMESTAMPTZ,
  ADD COLUMN parent_file_id UUID,
  ADD CONSTRAINT files_parent_fk FOREIGN KEY (parent_file_id) REFERENCES files.files(file_id);

CREATE INDEX files_parent_idx ON files.files (parent_file_id);
