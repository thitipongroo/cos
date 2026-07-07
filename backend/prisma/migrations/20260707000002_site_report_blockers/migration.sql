-- G-M5b — Site Report "blockers" field (spec 11 §474 Site Reports entity; §20.7.6 daily report =
-- "manpower, blockers"; QM-1 web E2E #6). Free-text obstacles noted on a daily site report.
-- Backward-compatible additive column (QM-9): nullable, no default, no backfill.
ALTER TABLE site_ops.site_reports ADD COLUMN IF NOT EXISTS blockers TEXT;
