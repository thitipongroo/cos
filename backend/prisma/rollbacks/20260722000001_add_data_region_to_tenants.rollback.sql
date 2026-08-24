-- Rollback for 20260722000001_add_data_region_to_tenants.
-- Drops the data-residency region column from platform.tenants. Region assignment is lost;
-- re-applying the migration resets every tenant to the ap-southeast-1 default.

ALTER TABLE platform.tenants
  DROP COLUMN IF EXISTS data_region;
