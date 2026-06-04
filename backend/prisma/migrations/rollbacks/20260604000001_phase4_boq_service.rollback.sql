-- Rollback: Phase 4 BOQ Service migration
-- Drops tables in reverse dependency order (items → categories → versions).
-- Safe to run only when no deployed code references these tables.

DROP TABLE IF EXISTS boq_items CASCADE;
DROP TABLE IF EXISTS boq_categories CASCADE;
DROP TABLE IF EXISTS boq_versions CASCADE;
