-- IANA timezone for platform.tenants (Phase 20 Notification digest §19.3 + quiet hours §19.6).
-- The notification service evaluates per-tenant quiet-hour windows and schedules digests (daily 18:00,
-- weekly Mon 08:00) in this timezone. Chosen over deriving from data_region at read time (PO decision
-- 2026-07-23) so a tenant can set its own display timezone independent of the data-residency region.
--
-- NOT NULL DEFAULT keeps the add backward-compatible (QM-9). Existing rows are backfilled from their
-- data_region using the region→timezone map the service uses for new-tenant defaults; the column
-- default 'Asia/Bangkok' (primary region GLOB-001) covers any row the CASE does not match.

ALTER TABLE platform.tenants
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(40) NOT NULL DEFAULT 'Asia/Bangkok';

UPDATE platform.tenants
SET timezone = CASE data_region
  WHEN 'ap-southeast-7' THEN 'Asia/Bangkok'
  WHEN 'ap-southeast-1' THEN 'Asia/Singapore'
  WHEN 'eu-west-1'      THEN 'Europe/Dublin'
  ELSE 'Asia/Bangkok'
END;
