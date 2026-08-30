-- Rollback for 20260823000001_sync_exhausted_review_queue.
--
-- Drops the table, which takes its policy, indexes and grants with it. IF EXISTS so the rollback is
-- safe to run against a database where the migration failed part way through — the state a rollback
-- is most often reached from.

DROP TABLE IF EXISTS platform.sync_exhausted_items;
