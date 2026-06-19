-- Rollback: Phase 2 Tenant Settings.
-- Safe to run only when no deployed code references this table.

DROP TABLE IF EXISTS platform.tenant_settings CASCADE;
