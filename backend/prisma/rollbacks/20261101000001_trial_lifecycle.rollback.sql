-- Rollback: 20261101000001_trial_lifecycle
--
-- Removes the trial columns, the notices table and the 'LITE' plan value (ADR-109).
--
-- REFUSES TO RUN WHILE IT WOULD DESTROY A CUSTOMER'S STATE. A tenant on the LITE plan, or one whose
-- subscription_status is not ACTIVE, would lose its plan or its trial dates with no way to rebuild them. Move
-- those tenants first (convert them to ACTIVE on another plan, or delete trial tenants per
-- docs/runbooks/trial-tenant-deletion.md); the guard below stops the rollback until then.
--
-- ROLL THE BACKEND BACK FIRST. A backend that selects subscription_status or writes 'LITE' fails once these are
-- gone.
--
-- REMOVING AN ENUM VALUE. PostgreSQL has no ALTER TYPE … DROP VALUE, so the type is recreated without 'LITE'
-- and the column is moved onto it. Every value still in use is one of the three originals (the guard
-- guarantees it), so the cast cannot fail.
--
-- Re-runnable: IF EXISTS throughout; the type swap is skipped when 'LITE' is already gone.

DO $$
DECLARE
  blocked BOOLEAN;
BEGIN
  -- Nested and through EXECUTE: on a re-run the column is gone, and a static reference would fail to plan.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'platform' AND table_name = 'tenants' AND column_name = 'subscription_status'
  ) THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM platform.tenants WHERE subscription_status <> ''ACTIVE'')' INTO blocked;
    IF blocked THEN
      RAISE EXCEPTION 'rollback refused: tenants with subscription_status <> ACTIVE exist';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM platform.tenants WHERE plan_type::text = 'LITE') THEN
    RAISE EXCEPTION 'rollback refused: tenants on the LITE plan exist';
  END IF;
END $$;

DROP TABLE IF EXISTS platform.tenant_trial_notices;

DROP INDEX IF EXISTS platform.tenants_trial_lifecycle_idx;

ALTER TABLE platform.tenants
  DROP CONSTRAINT IF EXISTS tenants_trial_dates_consistent,
  DROP COLUMN IF EXISTS converted_at,
  DROP COLUMN IF EXISTS trial_request_ref,
  DROP COLUMN IF EXISTS trial_source,
  DROP COLUMN IF EXISTS trial_ends_at,
  DROP COLUMN IF EXISTS trial_started_at,
  DROP COLUMN IF EXISTS subscription_status;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'platform' AND t.typname = 'PlanType' AND e.enumlabel = 'LITE'
  ) THEN
    CREATE TYPE platform."PlanType_without_lite" AS ENUM ('STARTER', 'PROFESSIONAL', 'ENTERPRISE');
    ALTER TABLE platform.tenants
      ALTER COLUMN plan_type TYPE platform."PlanType_without_lite"
      USING plan_type::text::platform."PlanType_without_lite";
    DROP TYPE platform."PlanType";
    ALTER TYPE platform."PlanType_without_lite" RENAME TO "PlanType";
  END IF;
END $$;
