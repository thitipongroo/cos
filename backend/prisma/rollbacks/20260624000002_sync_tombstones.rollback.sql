-- Rollback: 20260624000002_sync_tombstones
-- Drops platform.sync_tombstones (policy, index, and grants drop with the table).
-- Run ONLY if migration must be reverted — /sync/delta deleted[] tracking is lost and
-- offline clients can no longer learn about server-side deletions until re-created.

DROP TABLE IF EXISTS platform.sync_tombstones CASCADE;
