-- Rollback: 20260728000001_add_last_seen_to_users
-- Safe: additive, nullable-by-default-backfill column with no dependents. Dropping it removes the
-- last-seen signal, so the Tenant Admin User Audit loses its data source (it degrades to "no data").

ALTER TABLE platform.users
  DROP COLUMN IF EXISTS last_seen_at;
