-- G-M3b — QC inspection issue severity (spec 11 §517: "issue_severity ... nullable; populated when
-- result is fail or conditional"; QM-1 web E2E #9 "result recorded as fail → issue_severity populated").
-- Backward-compatible additive column (QM-9): nullable, no default, no backfill — old code that does not
-- write this column keeps working.
ALTER TABLE site_ops.inspections
  ADD COLUMN IF NOT EXISTS issue_severity VARCHAR(10)
    CHECK (issue_severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));
