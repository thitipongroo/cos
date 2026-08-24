-- Rollback for 20260808000001_add_shift_and_blocker_category_to_site_reports.
--
-- Drops both nullable columns. They were additive with no default and no code path requires them
-- (QM-9), so deployed callers that omit them are unaffected; a caller that SENDS them starts getting
-- a column-does-not-exist error, so roll the application back first, then this.
--
-- WHAT IS LOST: the shift and blocker classification of every report filed while the columns
-- existed. It cannot be reconstructed — the free-text `blockers` column survives and keeps the
-- operator's description, but the category derived from it does not, and nothing anywhere records
-- which shift a report covered. Re-applying the migration starts classification over from that
-- moment; reports filed in between stay NULL forever.
--
-- DROP COLUMN removes the attached CHECK constraints with it — they are column constraints, not
-- table-level ones, so no separate DROP CONSTRAINT is needed.
ALTER TABLE site_ops.site_reports
  DROP COLUMN IF EXISTS blocker_category;

ALTER TABLE site_ops.site_reports
  DROP COLUMN IF EXISTS shift;
