-- Rollback: add dedicated_db_url to platform.tenants
-- Reverses: 20260606000001_add_dedicated_db_url/migration.sql
-- WARNING: any tenant with a non-NULL dedicated_db_url will lose that routing config.
-- Verify no ENTERPRISE tenants are using dedicated DB routing before running.

ALTER TABLE platform.tenants DROP COLUMN IF EXISTS dedicated_db_url;
