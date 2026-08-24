-- Rollback for 20260810000001_add_category_and_verification_to_vendors.
--
-- Drops the two nullable columns and the partial index that serves the directory's category filter.
-- Both were additive (QM-9), so deployed code that never reads them is unaffected; a client that DOES
-- read them starts getting a column-does-not-exist error, so roll the application back FIRST, then
-- this.
--
-- WHAT IS LOST: every category assignment and every verification decision recorded while the columns
-- existed. Neither is reconstructible — no other table holds them, and the vendor's identity,
-- contacts and score are untouched, so what disappears is only "what it supplies" and "did we check
-- its papers". Re-applying the migration starts both over from NULL.
--
-- The TOP RATED badge is unaffected: it was never stored, being derived from the vendor score's
-- grade-A threshold.

DROP INDEX IF EXISTS procurement.idx_vendors_tenant_category;

ALTER TABLE procurement.vendors
  DROP COLUMN IF EXISTS verification_status;

ALTER TABLE procurement.vendors
  DROP COLUMN IF EXISTS category;
