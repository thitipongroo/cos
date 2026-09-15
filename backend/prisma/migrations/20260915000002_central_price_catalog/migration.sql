-- ราคากลาง central price catalog, its sync-run record, and the BOQ reference columns (ADR-061).
--
-- WHY THESE TABLES EXIST
-- ----------------------
-- ADR-061 (Accepted 2026-07-20, post-MVP) designed ราคากลาง — the Comptroller General's Department
-- reference prices used for Thai public-works estimating — as a platform-shared catalog that feeds BOQ
-- lines. Nothing had been built: no table, no module, no endpoint. Product-owner decision D8 (2026-09-15)
-- builds ADR-061 in full this round; D9 makes the e-GP adapter a stub seam and file import the working
-- path.
--
-- 1. platform.central_price_catalog — the ADR-061 columns, plus `category` (nullable TEXT). ADR-061 has
--    no category; the Stitch "Central Price Register" screen draws a "หมวดหมู่งาน" (work category) column,
--    and an imported file carries it. Recorded as an amendment in ADR-061.
--
-- 2. platform.central_price_sync_runs — NOT in ADR-061. The register screen draws an API-Sync panel and a
--    Failed-Sync panel; without a record of each import and sync attempt those panels could only show
--    invented state. One row per attempt, written when the attempt finishes. Recorded in ADR-061.
--
-- 3. boq.boq_items gains central_price_id, reference_price and price_variance, exactly as ADR-061 and
--    §11 name them.
--
-- NOT RLS-SCOPED (the two platform tables). The catalog is national public reference data shared by every
-- tenant (ADR-061 "platform schema — cross-tenant shared, RLS-exempt"; §11.0 exempts platform.* tables),
-- and a sync run describes the deployment's ingestion, not a tenant's data. Neither has a tenant_id to
-- scope by — the same standing as platform.scheduled_job_locks (20260819000002) and
-- platform.platform_settings (20260915000001). The audit row each import or sync writes IS tenant-scoped
-- and passes audit_logs' RLS through SET LOCAL app.current_tenant_id (CentralPricesAdminService).
--
-- GRANTS ARE NARROWER THAN THE PRECEDENT, ON PURPOSE. Earlier platform tables grant app_user
-- SELECT/INSERT/UPDATE/DELETE "so the schema stays uniform". Here app_user gets SELECT only. ADR-061 says
-- "Tenants read-only; SYSTEM_ADMIN manages", and every tenant request runs as app_user
-- (TenantPrismaService) — granting write privileges would leave that rule enforced by application code
-- alone. central_price_sync_runs gets NOTHING: it holds operator ids, uploaded file names and error
-- messages, and no tenant path reads it (Rule 41 review, 2026-09-15). The writes run on the privileged DATABASE_URL connection, as every SYSTEM_ADMIN platform write
-- already does (TenantService, PlatformSettingsService).
--
-- BACKWARD-COMPATIBLE (QM-9): two new tables and three NULLABLE columns with no default. The running
-- backend reads boq_items with `SELECT *` / `RETURNING *` (extra columns are ignored) and copies items
-- with an explicit column list that simply leaves the new columns NULL, so it keeps working before,
-- during and after this migration. No existing row, column, policy or grant is changed.
--
-- Rollback: backend/prisma/rollbacks/20260915000002_central_price_catalog.rollback.sql

-- ─── platform.central_price_catalog ─────────────────────────────────────────

CREATE TABLE platform.central_price_catalog (
  price_id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The item/material code a BOQ line is matched on. VARCHAR(100) because boq_items.item_code is
  -- VARCHAR(100): a catalog code longer than any item code could never be matched.
  code             VARCHAR(100)  NOT NULL,
  description      TEXT          NOT NULL,
  -- Not in ADR-061 — the register screen's "หมวดหมู่งาน" column (see header). Free text: no category
  -- vocabulary is specified anywhere, and inventing one would reject real files.
  category         TEXT          NULL,
  -- VARCHAR(50), matching boq_items.unit.
  unit             VARCHAR(50)   NOT NULL,
  -- §32.5: money is DECIMAL(19,4). A reference price cannot be negative.
  central_price    DECIMAL(19,4) NOT NULL
                     CONSTRAINT central_price_catalog_price_non_negative CHECK (central_price >= 0),
  currency_code    VARCHAR(3)    NOT NULL
                     CONSTRAINT central_price_catalog_currency_iso4217 CHECK (currency_code ~ '^[A-Z]{3}$'),
  -- ADR-061 "year/version", e.g. 2569 or 2569-01. The "latest" period for a code is the greatest value
  -- under byte ("C") ordering — see CentralPriceCatalogService.findReferencePrice.
  effective_period VARCHAR(32)   NOT NULL,
  -- ADR-061 ENUM(MANUAL_IMPORT / GOV_API), held as a CHECK like boq_versions.status so a later source is
  -- an ALTER of one constraint rather than a new type.
  source           VARCHAR(20)   NOT NULL
                     CONSTRAINT central_price_catalog_source_valid CHECK (source IN ('MANUAL_IMPORT', 'GOV_API')),
  -- Where the figures came from: the circular / announcement reference for an import, the upstream
  -- dataset id for GOV_API.
  source_ref       TEXT          NULL,
  -- NULL = not yet published; the register shows such a row as "Pending" and tenants never see it.
  published_at     TIMESTAMPTZ   NULL,
  is_active        BOOLEAN       NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),

  -- ADR-061: versioned by effective_period — one price per code per period. The import upsert arbitrates
  -- on this constraint.
  CONSTRAINT uq_central_price_catalog_code_period UNIQUE (code, effective_period)
);

-- The BOQ lookup and the tenant read: rows a tenant may see, for one code, newest period first.
CREATE INDEX idx_central_price_catalog_published_code
  ON platform.central_price_catalog (code, effective_period COLLATE "C" DESC)
  WHERE is_active AND published_at IS NOT NULL;

-- The admin register's period filter.
CREATE INDEX idx_central_price_catalog_period
  ON platform.central_price_catalog (effective_period);

-- ─── platform.central_price_sync_runs ───────────────────────────────────────

CREATE TABLE platform.central_price_sync_runs (
  run_id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- FILE_IMPORT = a SYSTEM_ADMIN upload; GOV_API = a CentralPriceAdapter run (ADR-061 §Ingestion).
  kind             VARCHAR(20)   NOT NULL
                     CONSTRAINT central_price_sync_runs_kind_valid CHECK (kind IN ('FILE_IMPORT', 'GOV_API')),
  -- The uploaded file's base name, or the adapter's name.
  source_name      VARCHAR(255)  NOT NULL,
  -- NULL when the attempt failed before a period was known (an adapter that is not configured).
  effective_period VARCHAR(32)   NULL,
  started_at       TIMESTAMPTZ   NOT NULL,
  -- A row is written once, when the attempt has finished, so both of these are always present: there is
  -- no "running" state to leave behind if the process dies mid-attempt.
  finished_at      TIMESTAMPTZ   NOT NULL,
  outcome          VARCHAR(20)   NOT NULL
                     CONSTRAINT central_price_sync_runs_outcome_valid
                     CHECK (outcome IN ('SUCCEEDED', 'FAILED', 'NOT_CONFIGURED')),
  records_total    INTEGER       NOT NULL DEFAULT 0
                     CONSTRAINT central_price_sync_runs_total_non_negative CHECK (records_total >= 0),
  records_inserted INTEGER       NOT NULL DEFAULT 0
                     CONSTRAINT central_price_sync_runs_inserted_non_negative CHECK (records_inserted >= 0),
  records_updated  INTEGER       NOT NULL DEFAULT 0
                     CONSTRAINT central_price_sync_runs_updated_non_negative CHECK (records_updated >= 0),
  records_rejected INTEGER       NOT NULL DEFAULT 0
                     CONSTRAINT central_price_sync_runs_rejected_non_negative CHECK (records_rejected >= 0),
  -- Machine-readable reason (e.g. MISSING_COLUMNS, ADAPTER_NOT_CONFIGURED) and an operator-facing
  -- sentence. Never a stack trace or an internal path (QM-10).
  error_code       VARCHAR(64)   NULL,
  error_message    TEXT          NULL,
  -- Who started it. Same foreign-key behaviour as audit_logs.actor_id and platform_settings.updated_by.
  actor_id         UUID          NULL
                     CONSTRAINT central_price_sync_runs_actor_id_fkey
                     REFERENCES platform.users (user_id) ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT central_price_sync_runs_finished_after_start CHECK (finished_at >= started_at)
);

-- sync-status reads the latest run, the latest success and the latest failure.
CREATE INDEX idx_central_price_sync_runs_started
  ON platform.central_price_sync_runs (started_at DESC);
CREATE INDEX idx_central_price_sync_runs_outcome_started
  ON platform.central_price_sync_runs (outcome, started_at DESC);

-- ─── boq.boq_items — ADR-061 reference columns ──────────────────────────────

ALTER TABLE boq.boq_items
  -- Which catalog row the reference was taken from. RESTRICT: a catalog row a BOQ line cites cannot be
  -- deleted from under it — reference_price is a snapshot, but the provenance is the audit answer to
  -- "where did this figure come from".
  ADD COLUMN IF NOT EXISTS central_price_id UUID NULL
    CONSTRAINT boq_items_central_price_id_fkey
    REFERENCES platform.central_price_catalog (price_id) ON DELETE RESTRICT,
  -- Snapshot of central_price when the line was linked (ADR-061). Later catalog changes do not move it.
  ADD COLUMN IF NOT EXISTS reference_price DECIMAL(19,4) NULL,
  -- unit_cost − reference_price, recomputed whenever unit_cost changes. Signed: negative = under the
  -- central price.
  ADD COLUMN IF NOT EXISTS price_variance DECIMAL(19,4) NULL;

-- The foreign key's own lookup (a catalog DELETE checks it) — only linked lines carry a value.
CREATE INDEX IF NOT EXISTS idx_boq_items_central_price
  ON boq.boq_items (central_price_id)
  WHERE central_price_id IS NOT NULL;

-- ─── Grants ─────────────────────────────────────────────────────────────────
-- SELECT only on the catalog, nothing on the sync runs — see "GRANTS ARE NARROWER THAN THE PRECEDENT" above.
--
-- A GRANT alone does NOT achieve that, and the REVOKE is the half that matters.
-- 20260623000001_app_user_login_and_grants set ALTER DEFAULT PRIVILEGES IN SCHEMA platform … GRANT
-- SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user, so every table the migration role creates in
-- platform is born with app_user=arwd. Verified 2026-09-15 on a clone of the local database: with only the
-- GRANT SELECT below, information_schema.role_table_grants listed INSERT, SELECT, UPDATE and DELETE for
-- app_user on central_price_catalog.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    REVOKE ALL ON platform.central_price_catalog   FROM app_user;
    REVOKE ALL ON platform.central_price_sync_runs FROM app_user;
    GRANT SELECT ON platform.central_price_catalog   TO app_user;
  END IF;
END $$;
