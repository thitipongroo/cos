-- Rollback: Phase 3 amendment (spatial hierarchy + asset/unit entities), migration 20260705000001.
-- Drops the tasks room-assignment FKs, RLS policies, and the 6 new tables. Data loss is irreversible.
-- Order: drop the tasks FKs first (they reference floors/rooms), then child→parent tables.

-- ─── Drop tasks room-assignment FK constraints ───────────────────────────────
ALTER TABLE projects.tasks DROP CONSTRAINT IF EXISTS fk_tasks_room;
ALTER TABLE projects.tasks DROP CONSTRAINT IF EXISTS fk_tasks_floor;

-- ─── Drop RLS policies (DISABLE + DROP POLICY, per QM-9 rollback requirement) ─
DO $$ DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('projects', 'assets'),
      ('projects', 'units'),
      ('projects', 'structures'),
      ('projects', 'rooms'),
      ('projects', 'floors'),
      ('projects', 'buildings')
    ) AS x(sch, tbl)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS rls_tenant_isolation ON %I.%I', t.sch, t.tbl);
    EXECUTE format('ALTER TABLE %I.%I DISABLE ROW LEVEL SECURITY', t.sch, t.tbl);
  END LOOP;
END $$;

-- ─── Drop tables (child → parent to satisfy FK dependencies) ─────────────────
DROP TABLE IF EXISTS projects.assets;
DROP TABLE IF EXISTS projects.units;
DROP TABLE IF EXISTS projects.structures;
DROP TABLE IF EXISTS projects.rooms;
DROP TABLE IF EXISTS projects.floors;
DROP TABLE IF EXISTS projects.buildings;
