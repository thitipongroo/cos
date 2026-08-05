-- Platform attestation signals + a revocation reason on platform.trusted_devices (ADR-082, ADR-081).
--
-- NO SECURITY PATCH LEVEL COLUMN, deliberately (ADR-083). ADR-082 specified one and required it be
-- read from the attestation verdict — but no verdict on either platform carries a patch date. Play
-- Integrity's deviceAttributes exposes sdkVersion alone, and App Attest returns no device data at
-- all. The tier in integrity_level is what the platforms actually establish, and on Android 13+ the
-- STRONG tier already means "patched within the last year". A permanently-NULL patch column on a
-- security table would only invite a future reader to fill it from the client, which is the one
-- source both ADR-082 and ADR-083 reject.
--
-- ADR-054 shipped device trust as a hardware-bound P-256 keypair and named a v2 it deferred:
-- platform attestation via Play Integrity / App Attest. ADR-082 accepted that v2, because a signing
-- key proves possession of a key and says NOTHING about the integrity of the platform holding it —
-- and two accepted decisions now need exactly that: the mockup's Security Patch Level and
-- Root / Jailbreak rows, and ADR-081's trust score, whose only strong input this is.
--
-- REVOCATION REASON EXISTS SO A LABEL EXISTS. ADR-081's model has one positive class — "this device
-- was later found compromised" — and `DELETE /auth/devices/:id` recorded only THAT a revocation
-- happened, never why. Without this column the training set has no positives and the model cannot be
-- built at all, so this is a prerequisite rather than a nicety.
--
-- ONLY `COMPROMISED` IS THE POSITIVE CLASS. The other three are ordinary hygiene: a user tidying up
-- old installs, an admin offboarding, a lost handset. Treating any of them as a compromise would
-- train the model that normal fleet churn looks like an attack, and every retired phone would drag
-- its owner's future devices' scores down.
--
-- Backward-compatible (QM-9): new types + nullable columns only. Nothing existing is touched, and
-- every already-enrolled device keeps NULL in all five — which is a meaningful state, see below.

CREATE TYPE platform."AttestationVerdict" AS ENUM ('PASSED', 'FAILED', 'UNAVAILABLE');

-- How strong the platform's answer was, when it gave one (ADR-083). Orthogonal to the verdict above:
-- the verdict says whether we got an answer, this says what the answer was worth.
--
-- These are Play Integrity's device-integrity labels. App Attest has no equivalent — it attests the
-- APP, not the device — so this is NULL on iOS, which is an absence of the concept rather than a
-- failure to obtain it.
--
-- STRONG carries a fact the platform will not hand over as a value: on Android 13+ it REQUIRES a
-- security update within the last year. That is why ADR-083 renders this tier instead of a patch
-- date — the tier is the conclusion the date was only evidence for.
CREATE TYPE platform."DeviceIntegrityLevel" AS ENUM ('STRONG', 'DEVICE', 'BASIC');

CREATE TYPE platform."DeviceRevocationReason" AS ENUM (
  'USER_REVOKED',
  'ADMIN_REVOKED',
  'LOST_OR_STOLEN',
  'COMPROMISED'
);

ALTER TABLE platform.trusted_devices
  -- THREE states plus NULL, deliberately:
  --   PASSED      the platform vouched for device integrity
  --   FAILED      the platform answered and the device did not pass (rooted / tampered / emulator)
  --   UNAVAILABLE we asked and the platform could not answer (no Play Services, unsupported OS,
  --               verifier not configured) — ADR-082 requires this be distinct from FAILED
  --   NULL        never attempted; the enrolment predates this migration
  -- ADR-082's text folds UNAVAILABLE into NULL. Splitting them is strictly more informative and does
  -- not weaken the ADR's requirement: "we asked and got no answer" and "we never asked" score
  -- differently in ADR-081, and collapsing them would make an old-but-honest device indistinguishable
  -- from one whose platform integrity is unknown for a current reason.
  ADD COLUMN IF NOT EXISTS attestation_verdict  platform."AttestationVerdict",
  -- The tier, when there was one (ADR-083). NULL on iOS and whenever no verdict was obtained.
  ADD COLUMN IF NOT EXISTS integrity_level      platform."DeviceIntegrityLevel",
  -- When the verdict was obtained. NULL whenever attestation_verdict is NULL; a stale attested_at is
  -- how the trust score knows a PASSED verdict is months old.
  ADD COLUMN IF NOT EXISTS attested_at          TIMESTAMPTZ,
  -- The ONLY server-verified OS signal either platform offers: Play Integrity's
  -- deviceAttributes.sdkVersion, an Android API level (e.g. "34"). NOT expo-device's osVersion —
  -- that is self-reported by the device, and on a rooted device it is attacker-controlled.
  -- NULL on iOS: App Attest returns no device data at all.
  ADD COLUMN IF NOT EXISTS os_version           VARCHAR(32),
  -- Why trust ended. NULL while revoked_at is NULL; also NULL for revocations recorded before this
  -- migration, which therefore cannot be used as training labels either way (they are neither
  -- confirmed compromises nor confirmed benign).
  ADD COLUMN IF NOT EXISTS revocation_reason    platform."DeviceRevocationReason";

-- The label query for ADR-081: every confirmed compromise, fleet-wide. Partial, because COMPROMISED
-- is rare by design in a fleet where trust is earned and revocation is manual — the whole reason
-- that ADR gates promotion on PR-AUC against a baseline rather than on a row count.
CREATE INDEX IF NOT EXISTS idx_trusted_devices_compromised
  ON platform.trusted_devices (user_id, revoked_at)
  WHERE revocation_reason = 'COMPROMISED';

COMMENT ON COLUMN platform.trusted_devices.os_version IS '@pdpa(category: "identity") — OS version narrows device identification';
COMMENT ON COLUMN platform.trusted_devices.integrity_level IS '@pdpa(category: "identity") — platform integrity tier for a person''s device';
COMMENT ON COLUMN platform.trusted_devices.attestation_verdict IS '@pdpa(category: "identity") — platform integrity verdict for a person''s device';
COMMENT ON COLUMN platform.trusted_devices.revocation_reason IS '@pdpa(category: "identity") — why a person''s device lost trust; COMPROMISED is the ADR-081 training label';
