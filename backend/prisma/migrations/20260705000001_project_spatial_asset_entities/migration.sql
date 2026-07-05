-- Phase 3 (amendment 2026-07-05): spatial hierarchy + asset/unit entities.
-- Source: master §Phase 3 Entities (buildings/floors/rooms/structures/assets) +
--         docs/specifications/10-construction-ontology §10.2 (Physical Objects) +
--         docs/specifications/11-database-schema §11.2 (Unit, Assets).
-- PO decisions 2026-07-05: E1=full CRUD, E2=building naming per §11.2 (building_name/building_type)
--   + include buildings.location per §10.2, E3=include Unit per §11.2. Assets include asset_type
--   per §11.2 (extends the "follow §11.2" ruling). All tables carry tenant_id + created_by +
--   created_at + updated_at per file 01 §D ("All tables must include ...").
-- Schema: projects (master §Phase 3 header "Entities — schema: projects").
-- Backward-compatible: new tables only. RLS + app_user grants applied inline (Phase 16 standard).
-- Rollback: prisma/rollbacks/20260705000001_project_spatial_asset_entities.rollback.sql

-- ─── buildings (§10.2 Physical Objects; naming per §11.2, location per §10.2) ─────────────────
CREATE TABLE projects.buildings (
  building_id   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID         NOT NULL REFERENCES projects.projects (project_id) ON DELETE CASCADE,
  tenant_id     UUID         NOT NULL,
  building_name VARCHAR(255) NOT NULL,
  building_type VARCHAR(100),
  total_floors  INTEGER,
  location      VARCHAR(255),
  status        VARCHAR(50),
  created_by    UUID         NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_buildings_tenant_project ON projects.buildings (tenant_id, project_id);

-- ─── floors (§10.2) ──────────────────────────────────────────────────────────────────────────
CREATE TABLE projects.floors (
  floor_id       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id    UUID          NOT NULL REFERENCES projects.buildings (building_id) ON DELETE CASCADE,
  tenant_id      UUID          NOT NULL,
  floor_number   INTEGER       NOT NULL,
  gross_area_sqm DECIMAL(12,2),
  created_by     UUID          NOT NULL,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_floors_tenant_building ON projects.floors (tenant_id, building_id);

-- ─── rooms (§10.2) ───────────────────────────────────────────────────────────────────────────
CREATE TABLE projects.rooms (
  room_id     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_id    UUID          NOT NULL REFERENCES projects.floors (floor_id) ON DELETE CASCADE,
  tenant_id   UUID          NOT NULL,
  room_number VARCHAR(50)   NOT NULL,
  room_type   VARCHAR(100),
  area_sqm    DECIMAL(12,2),
  created_by  UUID          NOT NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_rooms_tenant_floor ON projects.rooms (tenant_id, floor_id);

-- ─── structures (§10.2; structure_type controlled vocab via CHECK, per recent VARCHAR+CHECK convention) ─
CREATE TABLE projects.structures (
  structure_id   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id    UUID         NOT NULL REFERENCES projects.buildings (building_id) ON DELETE CASCADE,
  tenant_id      UUID         NOT NULL,
  structure_type VARCHAR(10)  NOT NULL CHECK (structure_type IN ('column', 'beam', 'slab', 'wall')),
  material_type  VARCHAR(100),
  created_by     UUID         NOT NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_structures_tenant_building ON projects.structures (tenant_id, building_id);

-- ─── units (§11.2; added per PO decision E3) ─────────────────────────────────────────────────
CREATE TABLE projects.units (
  unit_id     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL,
  building_id UUID         NOT NULL REFERENCES projects.buildings (building_id) ON DELETE CASCADE,
  project_id  UUID         NOT NULL REFERENCES projects.projects (project_id) ON DELETE CASCADE,
  unit_number VARCHAR(50)  NOT NULL,
  unit_type   VARCHAR(100),
  status      VARCHAR(50),
  created_by  UUID         NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_units_tenant_building ON projects.units (tenant_id, building_id);

-- ─── assets (§11.2 line 768; asset_type included per §11.2) ──────────────────────────────────
CREATE TABLE projects.assets (
  asset_id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID         NOT NULL,
  project_id         UUID         NOT NULL REFERENCES projects.projects (project_id) ON DELETE CASCADE,
  asset_type         VARCHAR(100),
  handover_date      DATE,
  warranty_expiry    DATE,
  maintenance_status VARCHAR(50),
  created_by         UUID         NOT NULL,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_assets_tenant_project ON projects.assets (tenant_id, project_id);

-- ─── tasks room-assignment FKs (master §Phase 3: "tasks reference floor_id / room_id nullable FKs") ─
-- projects.tasks already has bare floor_id/room_id UUID columns (20260619000002); now that the
-- floors/rooms tables exist, add the nullable FK constraints (loose room-assignment).
ALTER TABLE projects.tasks
  ADD CONSTRAINT fk_tasks_floor FOREIGN KEY (floor_id) REFERENCES projects.floors (floor_id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_tasks_room  FOREIGN KEY (room_id)  REFERENCES projects.rooms (room_id)  ON DELETE SET NULL;

-- ─── RLS: tenant isolation (Phase 16 standard policy, replicated for the 6 new tables) ───────
DO $$ DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('projects', 'buildings'),
      ('projects', 'floors'),
      ('projects', 'rooms'),
      ('projects', 'structures'),
      ('projects', 'units'),
      ('projects', 'assets')
    ) AS x(sch, tbl)
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t.sch, t.tbl);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', t.sch, t.tbl);
    EXECUTE format('DROP POLICY IF EXISTS rls_tenant_isolation ON %I.%I', t.sch, t.tbl);
    EXECUTE format($p$
      CREATE POLICY rls_tenant_isolation ON %I.%I
        AS PERMISSIVE FOR ALL TO app_user
        USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid)
    $p$, t.sch, t.tbl);
  END LOOP;
END $$;

-- ─── Grants: app_user needs table privileges (RLS still restricts rows per tenant) ────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON projects.buildings  TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON projects.floors      TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON projects.rooms       TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON projects.structures  TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON projects.units       TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON projects.assets      TO app_user;
  END IF;
END $$;
