-- Rollback for 20260823000002_tasks_incidents_modified_at.
--
-- ⚠️ REVERT THE APPLICATION FIRST. `SyncService.ENTITY_REGISTRY` pages `task` and `safety` on
-- `modified_at`; dropping the column under a running backend makes `GET /sync/delta` fail for both
-- types — `column "modified_at" does not exist` — which is a hard error on every device wake, not a
-- degradation. Deploy a backend whose registry is back on `created_at`, then run this.
--
-- Dropping the column loses the modification times permanently; they cannot be reconstructed,
-- because nothing else in the schema records when a task or an incident was last edited
-- (platform.audit_logs requires an actor and skips writes made without one).

DROP INDEX IF EXISTS site_ops.incidents_tenant_modified_idx;
DROP INDEX IF EXISTS projects.tasks_tenant_modified_idx;

ALTER TABLE site_ops.incidents DROP COLUMN IF EXISTS modified_at;
ALTER TABLE projects.tasks     DROP COLUMN IF EXISTS modified_at;
