-- projects.task_dependencies — the explicit Task → Task schedule edge (ADR-097).
--
-- WHY THIS TABLE EXISTS
-- ---------------------
-- `10-construction-ontology.md:117` and `12-construction-knowledge-graph.md:120` both define
-- DEPENDS_ON as a Task → Task N:M relationship. Nothing implemented it: a search of backend/src,
-- services/ and apps/ for that name returned no hits before this migration.
--
-- What existed instead is completion gate 3, which infers predecessors from the BOQ CATEGORY
-- hierarchy (`tasks.repository.ts::countIncompletePredecessors`, ADR-026 — `boq.boq_items` has no
-- item-level parent, so the category is the only hierarchy available). That inference works as a
-- gate and cannot serve as a schedule network: it carries no direction between two named tasks, no
-- dependency type and no lag, so a forward/backward pass over it computes nothing.
--
-- GATE 3 IS NOT CHANGED BY THIS MIGRATION. `countIncompletePredecessors` keeps the ADR-026
-- derivation exactly as it is (product-owner decision 2026-09-04, ADR-097 §Rationale). The two
-- mechanisms coexist on purpose: ADR-026 gates completion, this table describes the schedule.
-- Anyone unifying them later should read that section first — switching the gate to this table
-- weakens it for every task that has no row here.
--
-- CYCLES ARE REJECTED IN APPLICATION CODE, NOT HERE. A CHECK constraint cannot see a graph, and a
-- trigger doing a recursive walk on every INSERT would be the first such trigger in this schema
-- (the 2026-08-23 `modified_at` decision was explicitly to keep this class of rule in application
-- code and let CI enforce it). `TasksService` runs the reachability check and raises COS-TASK-003.
-- What the table DOES enforce is the two conditions a constraint can express: no self-edge, and no
-- duplicate edge between the same ordered pair.

CREATE TABLE projects.task_dependencies (
  dependency_id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        NOT NULL,
  -- Denormalised from the tasks so the portfolio query can filter without joining twice. Both tasks
  -- of an edge belong to the same project; a cross-project edge is not a scheduling relationship
  -- this product models, and the application rejects one before it reaches here.
  project_id          UUID        NOT NULL,
  predecessor_task_id UUID        NOT NULL REFERENCES projects.tasks (task_id) ON DELETE CASCADE,
  successor_task_id   UUID        NOT NULL REFERENCES projects.tasks (task_id) ON DELETE CASCADE,
  -- The four PDM relationships. All four are carried from the first migration because adding one
  -- later would rewrite every row; only FS is exercised by seeded data today (ADR-097 §Neutral).
  --   FS finish-to-start · SS start-to-start · FF finish-to-finish · SF start-to-finish
  dependency_type     VARCHAR(2)  NOT NULL DEFAULT 'FS'
                        CHECK (dependency_type IN ('FS', 'SS', 'FF', 'SF')),
  -- SIGNED ON PURPOSE. A negative value is a lead ("start 3 days before the predecessor finishes"),
  -- which is ordinary in construction scheduling, so there is no non-negative CHECK here.
  lag_days            INTEGER     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  modified_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A task cannot precede itself. The one cycle a constraint can catch, so it is caught here rather
  -- than left to the application check that handles the longer ones.
  CONSTRAINT task_dependencies_no_self_edge
    CHECK (predecessor_task_id <> successor_task_id),
  -- One edge per ordered pair. tenant_id leads so the index it creates serves tenant-scoped reads.
  CONSTRAINT task_dependencies_unique_edge
    UNIQUE (tenant_id, predecessor_task_id, successor_task_id)
);

-- The forward pass walks successors, the backward pass walks predecessors, and both run per project.
CREATE INDEX idx_task_dependencies_successor ON projects.task_dependencies (successor_task_id);
CREATE INDEX idx_task_dependencies_predecessor ON projects.task_dependencies (predecessor_task_id);
CREATE INDEX idx_task_dependencies_project ON projects.task_dependencies (project_id, tenant_id);

-- ─── RLS: the canonical single-permissive policy ─────────────────────────────
-- The form is the one 20260822000001_normalize_rls_tenant_isolation_policies settled on, NULLIF
-- guard included: an EMPTY app.current_tenant_id casts as ''::uuid and raises 22P02 without it,
-- where the intent is zero rows. RLS on a domain table is mandatory from MVP (spec §7.7) — the
-- application-layer tenant filter is defence in depth, never the isolation mechanism.

ALTER TABLE projects.task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects.task_dependencies FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_tenant_isolation ON projects.task_dependencies;

CREATE POLICY rls_tenant_isolation ON projects.task_dependencies
  AS PERMISSIVE
  FOR ALL
  TO app_user
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON projects.task_dependencies TO app_user;
