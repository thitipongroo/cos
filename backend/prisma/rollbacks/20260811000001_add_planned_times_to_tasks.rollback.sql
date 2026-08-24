-- Rollback for 20260811000001_add_planned_times_to_tasks.
--
-- Drops both nullable columns. They were additive with no default and no code path requires them
-- (QM-9): every consumer already falls back to the DATE columns when the times are NULL, which is
-- the same path a pre-migration row takes. A caller that SENDS them starts getting a
-- column-does-not-exist error, so roll the application back first, then this.
--
-- WHAT IS LOST: the planned working window of every task scheduled while the columns existed. It
-- cannot be reconstructed — planned_start and planned_end survive and keep the days, but nothing
-- anywhere records the hours within them. Re-applying the migration starts from empty; tasks
-- scheduled in between stay NULL forever and their cards fall back to showing dates.
ALTER TABLE projects.tasks
  DROP COLUMN IF EXISTS planned_end_time;

ALTER TABLE projects.tasks
  DROP COLUMN IF EXISTS planned_start_time;
