-- Phase 21: Equipment Service
-- Creates: equipment schema (3 tables), equipment_telemetry schema (TimescaleDB hypertable)
-- Source: spec §Phase 21 entities

-- ─── Schema ──────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS equipment;
CREATE SCHEMA IF NOT EXISTS equipment_telemetry;

-- ─── ENUM types ──────────────────────────────────────────────────────────────
CREATE TYPE equipment.equipment_type_enum AS ENUM (
  'CRANE', 'EXCAVATOR', 'CONCRETE_MIXER', 'GENERATOR', 'SCAFFOLD', 'VEHICLE', 'OTHER'
);

CREATE TYPE equipment.equipment_status_enum AS ENUM (
  'AVAILABLE', 'IN_USE', 'MAINTENANCE', 'RETIRED'
);

CREATE TYPE equipment.maintenance_type_enum AS ENUM (
  'SCHEDULED', 'UNSCHEDULED', 'REPAIR'
);

CREATE TYPE equipment.maintenance_status_enum AS ENUM (
  'PENDING', 'IN_PROGRESS', 'COMPLETED'
);

-- ─── equipment ───────────────────────────────────────────────────────────────
CREATE TABLE equipment.equipment (
  equipment_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL,
  equipment_code VARCHAR(50) NOT NULL,
  equipment_name VARCHAR(255) NOT NULL,
  equipment_type equipment.equipment_type_enum NOT NULL,
  status         equipment.equipment_status_enum NOT NULL DEFAULT 'AVAILABLE',
  purchase_date  DATE,
  purchase_cost  DECIMAL(19,4),
  currency_code  VARCHAR(3),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_equipment_code UNIQUE (tenant_id, equipment_code)
);

ALTER TABLE equipment.equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY equipment_tenant_isolation ON equipment.equipment
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

-- ─── equipment_assignments ────────────────────────────────────────────────────
CREATE TABLE equipment.equipment_assignments (
  assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id  UUID NOT NULL REFERENCES equipment.equipment(equipment_id),
  project_id    UUID NOT NULL,
  tenant_id     UUID NOT NULL,
  assigned_by   UUID NOT NULL,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  returned_at   TIMESTAMPTZ,
  notes         TEXT
);

ALTER TABLE equipment.equipment_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY equipment_assignments_tenant_isolation ON equipment.equipment_assignments
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

CREATE INDEX idx_equipment_assignments_project ON equipment.equipment_assignments(project_id);
CREATE INDEX idx_equipment_assignments_equipment ON equipment.equipment_assignments(equipment_id, returned_at);

-- ─── equipment_maintenance ────────────────────────────────────────────────────
CREATE TABLE equipment.equipment_maintenance (
  maintenance_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id     UUID NOT NULL REFERENCES equipment.equipment(equipment_id),
  tenant_id        UUID NOT NULL,
  maintenance_type equipment.maintenance_type_enum NOT NULL,
  status           equipment.maintenance_status_enum NOT NULL DEFAULT 'PENDING',
  scheduled_at     TIMESTAMPTZ NOT NULL,
  completed_at     TIMESTAMPTZ,
  cost             DECIMAL(19,4),
  currency_code    VARCHAR(3),
  performed_by     VARCHAR(255),
  notes            TEXT
);

ALTER TABLE equipment.equipment_maintenance ENABLE ROW LEVEL SECURITY;

CREATE POLICY equipment_maintenance_tenant_isolation ON equipment.equipment_maintenance
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

CREATE INDEX idx_maintenance_equipment ON equipment.equipment_maintenance(equipment_id, scheduled_at DESC);

-- ─── TimescaleDB hypertable: equipment_utilization ────────────────────────────
-- TimescaleDB must be installed: shared_preload_libraries = 'timescaledb'
CREATE TABLE equipment_telemetry.equipment_utilization (
  recorded_at    TIMESTAMPTZ NOT NULL,
  equipment_id   UUID NOT NULL,
  tenant_id      UUID NOT NULL,
  project_id     UUID,
  hours_operated DECIMAL(5,2),
  fuel_consumed  DECIMAL(8,2),
  operator_id    UUID
);

-- Convert to hypertable (partitioned by recorded_at, 1-day chunks)
SELECT create_hypertable(
  'equipment_telemetry.equipment_utilization',
  'recorded_at',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

CREATE INDEX idx_util_equipment_time ON equipment_telemetry.equipment_utilization
  (equipment_id, recorded_at DESC);

-- ─── GRANT to app_user ────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT USAGE ON SCHEMA equipment TO app_user;
    GRANT USAGE ON SCHEMA equipment_telemetry TO app_user;
    GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA equipment TO app_user;
    GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA equipment_telemetry TO app_user;
  END IF;
END $$;
