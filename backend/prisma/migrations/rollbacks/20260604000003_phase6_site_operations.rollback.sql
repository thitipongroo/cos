-- Rollback: Phase 6 Site Operations migration
-- Drops tables in reverse dependency order.
-- Safe to run only when no deployed code references these tables.

DROP TABLE IF EXISTS conflict_records CASCADE;
DROP TABLE IF EXISTS manpower_logs CASCADE;
DROP TABLE IF EXISTS inspections CASCADE;
DROP TABLE IF EXISTS safety_checklists CASCADE;
DROP TABLE IF EXISTS issues CASCADE;
DROP TABLE IF EXISTS site_reports CASCADE;
