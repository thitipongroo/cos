-- PDPA §19 consent records (ADR-079; closes PDPA-20/21/22, which pdpa-controls.md records as OPEN).
--
-- WHY A TABLE AND NOT A KEYCLOAK CLAIM: docs/policies/data-residency-policy.md §3 assumes a
-- "Keycloak consent claim". No such claim exists — the realm sets "consentRequired": false on every
-- client, and the Path A (SMS OTP) flow never traverses a Keycloak consent screen at all. Consent has
-- to be the platform's own record or it is not a record.
--
-- KEYED BY PURPOSE, NOT BY USER. PDPA §19 requires consent specific to a purpose; one blanket
-- "I agree" is both what regulators reject and useless as PDPA-22 evidence. The purposes are the
-- @pdpa categories that migration 20260803000001_tag_pii_columns actually tagged AND that ADR-079
-- assigns the consent lawful basis:
--
--   LOCATION     lat/lng on attendance_logs, site_reports, issues, incidents, inspections
--   FINANCIAL    workforce.project_workforce.daily_rate
--   OPERATIONAL  derived profile signals (e.g. the ADR-080 Behavioral Context)
--
-- identity and contact are DELIBERATELY ABSENT from the enum. ADR-079 assigns them the CONTRACT basis
-- (PDPA §24(3)) because an account cannot exist without a name and a phone number or email; a
-- withdraw toggle there would silently break sign-in. Adding enum values for them would invite writing
-- consent rows that contradict that decision. ConsentService reports their basis without a row, and
-- the route out of contract-based processing is erasure (PDPA-13), not withdrawal.
--
-- APPEND-ONLY. Granting and withdrawing both INSERT; the effective state is the latest row per
-- (user_id, purpose). An UPDATE-in-place row cannot answer "what did this person consent to on the
-- day that record was written", which is exactly what an audit asks. Enforced by the GRANT below:
-- app_user gets SELECT + INSERT only, never UPDATE or DELETE — the same mechanism that makes
-- platform.audit_logs immutable (QM-4). RLS alone would not do this; the privilege is what binds.
--
-- notice_version records WHICH privacy notice was agreed to. Not invented: apps/mobile/src/components/
-- PrivacyPolicyDocument.tsx exports POLICY_VERSION ('1.0.0'), rendered on the policy screen.
--
-- Cross-tenant identity data, like platform.users and platform.trusted_devices, so it lives in the
-- platform schema — but it carries tenant_id and the standard rls_tenant_isolation policy (ADR-031),
-- because ENABLE without a policy denies app_user everything.
--
-- Backward-compatible (QM-9): new table only. No existing column, type, constraint or row is touched,
-- so deployed code keeps working while this migration runs.

CREATE TYPE platform."ConsentPurpose" AS ENUM ('LOCATION', 'FINANCIAL', 'OPERATIONAL');

CREATE TABLE IF NOT EXISTS platform.consents (
  consent_id     UUID                        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID                        NOT NULL,
  user_id        UUID                        NOT NULL REFERENCES platform.users (user_id) ON DELETE CASCADE,
  purpose        platform."ConsentPurpose"   NOT NULL,
  -- true = granted, false = withdrawn. Both are INSERTs; neither mutates the prior row.
  granted        BOOLEAN                     NOT NULL,
  -- Version of the privacy notice in force when the decision was made (PrivacyPolicyDocument.tsx).
  notice_version VARCHAR(32)                 NOT NULL,
  recorded_at    TIMESTAMPTZ                 NOT NULL DEFAULT now()
);

-- The only hot query is "latest row per (user, purpose)" — DESC on recorded_at so the planner can
-- stop at the first row per key instead of sorting the user's whole consent history.
CREATE INDEX IF NOT EXISTS idx_consents_effective
  ON platform.consents (user_id, purpose, recorded_at DESC);

-- Tenant isolation, identical to every other table carrying a tenant_id (20260608000004_rls_policies).
ALTER TABLE platform.consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.consents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_tenant_isolation ON platform.consents;
CREATE POLICY rls_tenant_isolation ON platform.consents
  AS PERMISSIVE
  FOR ALL
  TO app_user
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid);

-- SELECT + INSERT only. The absent UPDATE/DELETE is the append-only guarantee, not an oversight.
GRANT SELECT, INSERT ON platform.consents TO app_user;

-- PII tagging, same convention as 20260803000001_tag_pii_columns.
COMMENT ON COLUMN platform.consents.user_id IS '@pdpa(category: "identity") — links a consent decision to a person';
COMMENT ON COLUMN platform.consents.purpose IS '@pdpa(category: "operational") — which processing purpose the decision covers';
