-- Rollback for 20260813000001_add_contractor_description_reason_to_permits.
--
-- Drops the three nullable columns added for the Safety Officer permit screens. All three were
-- additive (QM-9), so deployed code that never reads them is unaffected; a client that DOES read
-- them starts getting a column-does-not-exist error, so roll the application back FIRST, then this.
--
-- WHAT IS LOST: every contractor name, every work description, and every rejection reason recorded
-- while the columns existed. None is reconstructible — no other table holds them. What survives is
-- the permit itself: its type, number, validity window, status and links are untouched, so a permit
-- revoked while these columns existed stays REVOKED, it just no longer says why.
--
-- No index to drop: the migration deliberately added none (all three are display fields;
-- idx_permits_project already serves the dashboard's filter).

ALTER TABLE site_ops.permits
  DROP COLUMN IF EXISTS revoke_reason;

ALTER TABLE site_ops.permits
  DROP COLUMN IF EXISTS description;

ALTER TABLE site_ops.permits
  DROP COLUMN IF EXISTS contractor_name;
