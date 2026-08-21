-- Rollback: 20260723000002_add_timezone_to_tenants
-- Reverses: migrations/20260723000002_add_timezone_to_tenants/migration.sql
--
-- The migration adds the column and then backfills it from data_region. Dropping the column reverses
-- both — the UPDATE wrote only into this column, so nothing else needs undoing. IF EXISTS keeps this
-- idempotent (§9.7.1).
--
-- WARNING: drops each tenant's IANA timezone, including any value a tenant set for itself rather
-- than inheriting from its data_region. The Notification Service (Phase 20) evaluates quiet hours
-- (§19.6) and schedules digests (§19.3) in this timezone; without the column it must fall back to the
-- region→timezone map, which is not the same thing for a tenant that overrode it. Export
-- (tenant_id, timezone) before running.

ALTER TABLE platform.tenants
  DROP COLUMN IF EXISTS timezone;
