-- PDPA §30/§31 data-export requests (ADR-078; closes PDPA-10/11, recorded OPEN in pdpa-controls.md).
--
-- WHY A TABLE AND NOT A FIRE-AND-FORGET JOB: PDPA §30 gives the controller 30 days to answer a
-- verified request. "We ran a job" is not an answer to an auditor; a row per request, with who asked,
-- what they asked for, when, and what happened, is. It is also what lets the subject see the state of
-- their own request instead of re-submitting because nothing visibly happened.
--
-- CATEGORIES are the platform's own @pdpa taxonomy (migration 20260803000001), stored as a text[] of
-- the five tagged categories. NOT the mockup's invented list ("payroll slips, expense claims") —
-- payroll does not exist, and Phase 7 states the finance service is project cost tracking, not
-- accounting. `financial` stays available because workforce.project_workforce.daily_rate is tagged
-- @pdpa(category: "financial"); if a payroll module is ever built its columns join by being tagged.
--
-- file_id is the File Service reference (ADR-078 correction 2026-08-04): the backend has no MinIO
-- client and must not grow one — master fixes Main App <-> File Service as REST, so the archive is
-- uploaded through FileServiceClient and only its id is kept here. NULL until the job finishes.
--
-- expires_at is the REQUEST's 7-day validity, NOT a signed-URL lifetime. The emailed link points at
-- an authenticated in-app page that mints a fresh 1-hour signed URL on click; mailing a week-long
-- bearer URL for a RESTRICTED payload was rejected (ADR-078).
--
-- Cross-tenant identity data like platform.users, but carrying tenant_id + the standard
-- rls_tenant_isolation policy (ADR-031) — ENABLE without a policy denies app_user everything.
--
-- Backward-compatible (QM-9): new type + new table only. Nothing existing is touched.

CREATE TYPE platform."ExportStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'EXPIRED');

CREATE TYPE platform."ExportFormat" AS ENUM ('JSON', 'CSV');

CREATE TABLE IF NOT EXISTS platform.export_requests (
  export_id     UUID                      PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID                      NOT NULL,
  user_id       UUID                      NOT NULL REFERENCES platform.users (user_id) ON DELETE CASCADE,
  -- Subset of the five @pdpa categories the subject selected.
  categories    TEXT[]                    NOT NULL,
  format        platform."ExportFormat"   NOT NULL,
  -- Optional reporting window; NULL = the complete record.
  from_date     DATE,
  to_date       DATE,
  status        platform."ExportStatus"   NOT NULL DEFAULT 'PENDING',
  -- File Service id of the finished archive. NULL until the workflow completes.
  file_id       UUID,
  -- Why it failed, for the subject and for the 30-day answer. Never a stack trace (QM-10).
  failure_reason TEXT,
  requested_at  TIMESTAMPTZ               NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  -- 7 days from request (ADR-078, product-owner decision 2026-08-04).
  expires_at    TIMESTAMPTZ               NOT NULL
);

-- The only hot query is "my requests, newest first" on the self-service screen.
CREATE INDEX IF NOT EXISTS idx_export_requests_user
  ON platform.export_requests (user_id, requested_at DESC);

-- Drives the expiry sweep: find READY rows past expires_at so the archive can be deleted.
CREATE INDEX IF NOT EXISTS idx_export_requests_expiry
  ON platform.export_requests (status, expires_at);

ALTER TABLE platform.export_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.export_requests FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_tenant_isolation ON platform.export_requests;
CREATE POLICY rls_tenant_isolation ON platform.export_requests
  AS PERMISSIVE
  FOR ALL
  TO app_user
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON platform.export_requests TO app_user;

COMMENT ON COLUMN platform.export_requests.user_id IS '@pdpa(category: "identity") — links an export request to a person';
COMMENT ON COLUMN platform.export_requests.categories IS '@pdpa(category: "operational") — which categories of the subject''s data were exported';
