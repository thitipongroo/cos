-- Free-trial lifecycle and the LITE plan (spec §26.1, §26.1.2, §7.10; ADR-109).
--
-- WHAT THIS ADDS
-- --------------
-- 1. 'LITE' in platform."PlanType" — 1 active project, shared realm and shared DB like STARTER.
-- 2. platform.tenants.subscription_status and the trial columns. subscription_status is the commercial state
--    (ACTIVE / TRIAL / EXPIRED / PENDING_DELETION). It is NOT is_active: is_active stays the SYSTEM_ADMIN
--    deactivation switch, and every reader of is_active keeps its meaning (ADR-109 §Rationale).
-- 3. platform.tenant_trial_notices — one row per trial notice sent, so the daily job sends each notice at most
--    once per tenant even when it reruns or two replicas run it.
--
-- BACKWARD-COMPATIBLE (QM-9)
-- --------------------------
-- Additive only. Every existing tenant gets subscription_status 'ACTIVE' from the column default, which is
-- exactly what it is today; the new trial columns are NULL for it. The running backend never selects the new
-- columns, so it is unaffected before, during and after the migration. Adding an enum value cannot break a
-- reader of the existing values.
--
-- ALTER TYPE … ADD VALUE inside a transaction is allowed (PostgreSQL ≥ 12); the new value is not USED in this
-- migration, which is the one thing that would require it to be committed first.

ALTER TYPE platform."PlanType" ADD VALUE IF NOT EXISTS 'LITE' BEFORE 'STARTER';

ALTER TABLE platform.tenants
  ADD COLUMN subscription_status TEXT NOT NULL DEFAULT 'ACTIVE'
    CONSTRAINT tenants_subscription_status_valid
      CHECK (subscription_status IN ('ACTIVE', 'TRIAL', 'EXPIRED', 'PENDING_DELETION')),
  ADD COLUMN trial_started_at TIMESTAMPTZ,
  ADD COLUMN trial_ends_at TIMESTAMPTZ,
  -- Where the trial came from on construction-os.io (the CTA `source`, e.g. 'pricing'); for funnel reporting.
  ADD COLUMN trial_source TEXT
    CONSTRAINT tenants_trial_source_length CHECK (char_length(trial_source) <= 40),
  -- The construction-os.io trial request this tenant was opened from (public.trial_requests.id on the website's
  -- Supabase project), so trial → paid can be joined back to the request. Free text: a different system's key.
  ADD COLUMN trial_request_ref TEXT
    CONSTRAINT tenants_trial_request_ref_length CHECK (char_length(trial_request_ref) <= 80),
  ADD COLUMN converted_at TIMESTAMPTZ,
  -- A tenant that is or was a trial has both trial dates, and the end follows the start. A tenant created as
  -- a paying customer (ACTIVE, never a trial) has neither.
  ADD CONSTRAINT tenants_trial_dates_consistent CHECK (
    (subscription_status = 'ACTIVE' AND trial_started_at IS NULL AND trial_ends_at IS NULL)
    OR (trial_started_at IS NOT NULL AND trial_ends_at IS NOT NULL AND trial_ends_at > trial_started_at)
  );

-- The daily job reads only non-ACTIVE tenants, ordered by trial_ends_at. Partial: paying tenants are the bulk
-- of the table and are never scanned by it.
CREATE INDEX tenants_trial_lifecycle_idx
  ON platform.tenants (subscription_status, trial_ends_at)
  WHERE subscription_status <> 'ACTIVE';

CREATE TABLE platform.tenant_trial_notices (
  tenant_id UUID        NOT NULL REFERENCES platform.tenants (tenant_id) ON DELETE CASCADE,
  -- §7.10 Notifications: one value per row of that table, plus the SYSTEM_ADMIN deletion-due notice.
  notice    TEXT        NOT NULL
              CONSTRAINT tenant_trial_notices_notice_valid
                CHECK (notice IN ('DAY_0', 'DAY_7', 'DAY_21', 'DAY_28', 'DAY_30', 'DAY_53', 'DAY_60_ADMIN')),
  sent_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, notice)
);

-- Tenant-scoped, so RLS like every other tenant-keyed platform table (§7.7). The daily job uses the privileged
-- client, as every other platform.tenants reader does (20260804000001); app_user sees its own tenant's rows only.
ALTER TABLE platform.tenant_trial_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.tenant_trial_notices FORCE ROW LEVEL SECURITY;

CREATE POLICY rls_tenant_trial_notices_read ON platform.tenant_trial_notices
  AS PERMISSIVE FOR SELECT TO app_user
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid);
