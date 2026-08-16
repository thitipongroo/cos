-- Rollback: 20260816000001_add_vendor_type_to_vendors
--
-- Drops the column and its CHECK constraint. Destructive in one respect worth stating: any
-- INDIVIDUAL/JURISTIC classification an operator had already recorded is lost, and it cannot be
-- rebuilt from anything else in the schema (that is the whole reason the column was added — see the
-- migration header). Re-applying the migration gives back an all-NULL column.
--
-- Nothing else depends on it: 20260816000002 tags `tax_id`/`address` with a comment that REFERS to
-- this column but does not read it, so that migration keeps working; its tag text simply describes a
-- column that is no longer there until this one is re-applied.

ALTER TABLE procurement.vendors
  DROP CONSTRAINT IF EXISTS vendors_vendor_type_check;

ALTER TABLE procurement.vendors
  DROP COLUMN IF EXISTS vendor_type;
