-- Rollback: Phase 24 Digital Twin Layer
-- Reverses: 20260608000007_phase24_digital_twin/migration.sql
-- Drop order: hypertable → table → ENUMs → schema (reverse of creation)

-- ─── TimescaleDB hypertable ───────────────────────────────────────────────────
DROP TABLE IF EXISTS digital_twin.twin_states CASCADE;

-- ─── Tables ───────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS digital_twin.twin_entities CASCADE;

-- ─── ENUM types ───────────────────────────────────────────────────────────────
DROP TYPE IF EXISTS digital_twin.state_source_enum;
DROP TYPE IF EXISTS digital_twin.entity_type_enum;

-- ─── Schema ───────────────────────────────────────────────────────────────────
DROP SCHEMA IF EXISTS digital_twin CASCADE;
