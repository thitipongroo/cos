-- Rollback: 20260822000002_sync_exhaustions
--
-- Drops the tenant-admin review queue and its notification templates.
--
-- WHAT THIS LOSES, AND WHY IT IS NOT RECOVERABLE
-- ----------------------------------------------
-- Every PENDING row is a mutation a device could not sync — a safety incident, an attendance record,
-- an inspection result, a material consumption entry — that exists ONLY here and on the reporter's
-- phone. Dropping the table destroys the server's copy. The device's copy survives (§17.2 keeps it
-- until synced or admin-resolved), so the data is not gone from the world, but every pending item
-- goes back to being invisible to the tenant admin and the reporter has no way to know.
--
-- EXPORT FIRST if any row is PENDING:
--   \copy (SELECT * FROM platform.sync_exhaustions WHERE status = 'PENDING')
--     TO 'sync_exhaustions_pending.csv' CSV HEADER
--
-- Rolling back also re-opens TDD OQ-38: `onExhausted` on the mobile side will post to an endpoint
-- whose table is gone, so exhaustion reporting fails and — because the client treats a failed report
-- as non-fatal — escalation silently stops again. Revert the application change in the same step, or
-- do not run this.

DROP TABLE IF EXISTS platform.sync_exhaustions;

-- The templates are system rows (tenant_id IS NULL), so target them explicitly: a tenant that has
-- authored its own override for this event type keeps it, and would be orphaned rather than deleted.
DELETE FROM notifications.notification_templates
WHERE tenant_id IS NULL
  AND event_type = 'platform.sync.exhausted.v1';
