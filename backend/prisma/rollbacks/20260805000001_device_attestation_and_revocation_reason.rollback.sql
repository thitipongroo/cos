-- Rollback for 20260805000001_device_attestation_and_revocation_reason.
--
-- Drops the index, the five nullable columns and both enum types. The columns were additive and
-- nullable (QM-9), so no deployed code depends on their existence.
--
-- WHAT IS LOST, and it does not come back:
--
--  * every recorded `revocation_reason`. This is ADR-081's ONLY source of positive labels — a device
--    confirmed compromised — and the fact is not derivable from anything else: `revoked_at` records
--    that trust ended, never why. Dropping this column empties the positive class, and re-applying
--    the migration restarts label collection from zero. In a fleet where compromise is rare by
--    design, that is potentially months of the only labels that matter.
--  * every attestation verdict and patch level. Re-attesting recovers the CURRENT state on the next
--    login, but the history — when a device first passed, when it stopped — is gone.
--
-- Because the enum types are dropped, this must run before any re-apply; a re-apply recreates them.
DROP INDEX IF EXISTS platform.idx_trusted_devices_compromised;

ALTER TABLE platform.trusted_devices
  DROP COLUMN IF EXISTS revocation_reason,
  DROP COLUMN IF EXISTS os_version,
  DROP COLUMN IF EXISTS attested_at,
  DROP COLUMN IF EXISTS integrity_level,
  DROP COLUMN IF EXISTS attestation_verdict;

DROP TYPE IF EXISTS platform."DeviceRevocationReason";
DROP TYPE IF EXISTS platform."DeviceIntegrityLevel";
DROP TYPE IF EXISTS platform."AttestationVerdict";
