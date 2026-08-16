-- Subject requests raised by people who have NO platform account (ADR-090; PDPA-48).
--
-- WHY THIS TABLE EXISTS AT ALL. `platform.export_requests` (20260804000003) answers a request from an
-- ACCOUNT HOLDER: it is keyed by `user_id` and the subject drives it themselves. The people this
-- table is for — a CRM contact, a lead, the named contact at a vendor — have no account to key on and
-- cannot drive anything. The tenant is their controller (ADR-090 §1) and answers on its own behalf,
-- so what the platform records is the tenant's handling of the request, not the subject's session.
--
-- IT IS ALSO THE PERMISSION TO SEARCH. Without a request row there is no lawful reason for an admin
-- to look a stranger's email up in the tenant's customer base, and a free lookup would answer "is
-- this address one of your customers" to anyone with the tab open. So the row is created first and
-- every search cites it (ADR-090 §4). That binding is the enumeration control; it is not achieved by
-- asking the ADMIN for a second factor, because the admin is not the party whose identity is in
-- question and GDPR Art 12(2)/12(6) makes over-verification an infringement in its own right.
--
-- `received_at` IS NOT `opened_at`, AND THE DIFFERENCE IS THE DEADLINE. PDPA §30 runs 30 days from
-- when the CONTROLLER received the request — which happens off-platform, by email or phone, possibly
-- days before an admin keys it in. Deriving the due date from `opened_at` would silently extend a
-- statutory clock, so the operator supplies `received_at` and the platform never defaults it to now().
--
-- IDENTITY VERIFICATION IS NOT RECORDED AS A BOOLEAN. There is no `verified` flag: the tenant
-- verifies off-platform against what it already knows, and a checkbox saying "verified" that nothing
-- checks would be evidence of nothing. What is recorded is who opened it, when it arrived, and what
-- was done — the auditable trail Art 12 asks for.
--
-- Cross-tenant identity data like platform.users, but carrying tenant_id + the standard
-- rls_tenant_isolation policy (ADR-031) — ENABLE without a policy denies app_user everything.
--
-- Backward-compatible (QM-9): new types + new table only. Nothing existing is touched.
-- Rollback: prisma/rollbacks/20260816000003_subject_requests.rollback.sql

CREATE TYPE platform."SubjectRequestType" AS ENUM ('ACCESS', 'ERASURE');

CREATE TYPE platform."SubjectRequestStatus" AS ENUM ('OPEN', 'FULFILLED', 'REJECTED');

CREATE TABLE IF NOT EXISTS platform.subject_requests (
  request_id    UUID                             PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID                             NOT NULL,
  request_type  platform."SubjectRequestType"    NOT NULL,
  -- What the subject gave as their identifier. At least one is required — with neither there is
  -- nothing to search for, and the row would authorise a search it cannot scope.
  subject_email VARCHAR(255),
  subject_phone VARCHAR(50),
  status        platform."SubjectRequestStatus"  NOT NULL DEFAULT 'OPEN',
  -- When the TENANT received it. Starts the PDPA §30 30-day clock; supplied, never defaulted.
  received_at   TIMESTAMPTZ                      NOT NULL,
  -- The admin who keyed it in. Not the subject — the subject has no account.
  opened_by     UUID                             NOT NULL REFERENCES platform.users (user_id),
  opened_at     TIMESTAMPTZ                      NOT NULL DEFAULT now(),
  closed_at     TIMESTAMPTZ,
  -- What was done, or why it was refused. A refusal must name its basis: telling a subject their data
  -- is "kept for legal reasons" without naming the law is itself a breach (ADR-090 §5).
  outcome_note  TEXT,

  CONSTRAINT subject_requests_identifier_present
    CHECK (subject_email IS NOT NULL OR subject_phone IS NOT NULL),
  -- A closed request must say what happened; an open one must not pretend it has.
  CONSTRAINT subject_requests_closed_has_outcome
    CHECK ((status = 'OPEN' AND closed_at IS NULL) OR (status <> 'OPEN' AND closed_at IS NOT NULL))
);

-- The only hot query is the tenant's own queue, oldest-received first — the order that matters when
-- the deadline is counted from receipt.
CREATE INDEX IF NOT EXISTS idx_subject_requests_tenant_status
  ON platform.subject_requests (tenant_id, status, received_at);

ALTER TABLE platform.subject_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.subject_requests FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_tenant_isolation ON platform.subject_requests;
CREATE POLICY rls_tenant_isolation ON platform.subject_requests
  AS PERMISSIVE
  FOR ALL
  TO app_user
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON platform.subject_requests TO app_user;

-- The subject's own identifiers. COS holds these as PROCESSOR: the tenant is the controller of the
-- underlying CRM/vendor record and of this request about it (ADR-090 §1).
COMMENT ON COLUMN platform.subject_requests.subject_email IS '@pdpa(category: "contact", role: "processor") — the email a data subject identified themselves by';
COMMENT ON COLUMN platform.subject_requests.subject_phone IS '@pdpa(category: "contact", role: "processor") — the phone a data subject identified themselves by';
COMMENT ON COLUMN platform.subject_requests.opened_by IS '@pdpa(category: "operational") — traces the request record to the admin who keyed it in';
