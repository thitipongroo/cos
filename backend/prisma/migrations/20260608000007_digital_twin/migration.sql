-- Phase 24: Digital Twin Layer
-- Creates: digital_twin schema (twin_entities, twin_states hypertable)
-- Source: spec §Phase 24, §33.4 Data Model

-- ─── Schema ───────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS digital_twin;

-- ─── ENUMs ───────────────────────────────────────────────────────────────────
CREATE TYPE digital_twin.entity_type_enum AS ENUM (
  'STRUCTURE',
  'EQUIPMENT',
  'MATERIAL_STOCK',
  'WORKFORCE_ZONE',
  'INSPECTION_ZONE'
);

CREATE TYPE digital_twin.state_source_enum AS ENUM (
  'IOT',
  'MANUAL',
  'AI_INFERRED'
);

-- ─── twin_entities ────────────────────────────────────────────────────────────
CREATE TABLE digital_twin.twin_entities (
  entity_id       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID          NOT NULL,
  project_id      UUID          NOT NULL,
  entity_type     digital_twin.entity_type_enum NOT NULL,
  physical_ref    VARCHAR(255),                        -- IoT device ID / sensor ID
  digital_ref     VARCHAR(255),                        -- IFC GlobalId (22-char) or WBS node ID
  last_synced_at  TIMESTAMPTZ,
  confidence      DECIMAL(4,3)  NOT NULL DEFAULT 0,    -- [0.000, 1.000]
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

ALTER TABLE digital_twin.twin_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY twin_entities_tenant_isolation ON digital_twin.twin_entities
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);

CREATE INDEX idx_twin_entities_project ON digital_twin.twin_entities(project_id);
CREATE INDEX idx_twin_entities_physical_ref ON digital_twin.twin_entities(physical_ref)
  WHERE physical_ref IS NOT NULL;

-- ─── twin_states (TimescaleDB hypertable — append-only) ──────────────────────
CREATE TABLE digital_twin.twin_states (
  entity_id   UUID                           NOT NULL,
  tenant_id   UUID                           NOT NULL,
  recorded_at TIMESTAMPTZ                    NOT NULL,
  attributes  JSONB                          NOT NULL DEFAULT '{}',
  source      digital_twin.state_source_enum NOT NULL,
  confidence  DECIMAL(4,3)                   NOT NULL   -- [0.000, 1.000]; mandatory per spec §33.3
);

SELECT create_hypertable(
  'digital_twin.twin_states',
  'recorded_at',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists       => TRUE
);

-- Retention policy: raw state retained 2 years (managed by TimescaleDB)
SELECT add_retention_policy(
  'digital_twin.twin_states',
  INTERVAL '2 years',
  if_not_exists => TRUE
);

CREATE INDEX idx_twin_states_entity_time ON digital_twin.twin_states
  (entity_id, recorded_at DESC);
CREATE INDEX idx_twin_states_tenant ON digital_twin.twin_states(tenant_id, recorded_at DESC);
CREATE INDEX idx_twin_states_attributes ON digital_twin.twin_states
  USING gin(attributes jsonb_path_ops);

-- ─── GRANT ────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT USAGE ON SCHEMA digital_twin TO app_user;
    GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA digital_twin TO app_user;
  END IF;
END $$;
