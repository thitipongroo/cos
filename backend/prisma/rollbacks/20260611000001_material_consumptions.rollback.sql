-- Rollback: Phase 6 material_consumptions migration
-- Safe to run only when no deployed code references this table.

DROP TABLE IF EXISTS site_ops.material_consumptions CASCADE;
