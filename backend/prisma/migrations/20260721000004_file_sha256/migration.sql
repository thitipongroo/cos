-- File content SHA-256 (ADR-058 CT-3). Contract signing binds a VC to the SHA-256 of the signed
-- document; File Service computes it once on upload so signing reads it from metadata (no re-download).
-- files.files is owned by file-service (raw pg); nullable — pre-existing files have no hash.

ALTER TABLE files.files ADD COLUMN sha256 CHAR(64);
