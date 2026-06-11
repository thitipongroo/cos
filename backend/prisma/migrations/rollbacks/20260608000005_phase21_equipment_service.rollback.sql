-- Rollback: Phase 21 Equipment Service
-- Reverses: 20260608000005_phase21_equipment_service/migration.sql
-- Drop order: indexes → tables → ENUMs → schemas (reverse of creation)

-- ─── TimescaleDB hypertable ───────────────────────────────────────────────────
DROP TABLE IF EXISTS equipment_telemetry.equipment_utilization CASCADE;

-- ─── Tables ───────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS equipment.equipment_maintenance CASCADE;
DROP TABLE IF EXISTS equipment.equipment_assignments CASCADE;
DROP TABLE IF EXISTS equipment.equipment CASCADE;

-- ─── ENUM types ───────────────────────────────────────────────────────────────
DROP TYPE IF EXISTS equipment.maintenance_status_enum;
DROP TYPE IF EXISTS equipment.maintenance_type_enum;
DROP TYPE IF EXISTS equipment.equipment_status_enum;
DROP TYPE IF EXISTS equipment.equipment_type_enum;

-- ─── Schemas ──────────────────────────────────────────────────────────────────
DROP SCHEMA IF EXISTS equipment_telemetry CASCADE;
DROP SCHEMA IF EXISTS equipment CASCADE;
