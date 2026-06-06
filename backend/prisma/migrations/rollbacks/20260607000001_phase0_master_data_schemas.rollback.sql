-- Rollback: 20260607000001_phase0_master_data_schemas
-- Drops all master data tables and their enums (QM-9 backward-compat rollback).
-- Run ONLY if migration must be reverted — all seed data will be lost.

DROP TABLE IF EXISTS finance.cost_categories;
DROP TABLE IF EXISTS site_ops.inspection_types;
DROP TABLE IF EXISTS site_ops.issue_categories;
DROP TABLE IF EXISTS site_ops.work_categories;
DROP TABLE IF EXISTS procurement.materials;

DROP TYPE IF EXISTS "CostCategoryType";
DROP TYPE IF EXISTS "IssueSeverityDefault";
DROP TYPE IF EXISTS "MaterialUnit";
DROP TYPE IF EXISTS "MaterialCategory";
