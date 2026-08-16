-- Record whether a vendor is a juristic person or a natural person, so the PII classification of
-- `tax_id` and `address` can be decided per row instead of guessed for the table.
--
-- WHY THIS COLUMN EXISTS AT ALL. `procurement.vendors.tax_id` and `.address` are personal data when
-- the vendor is a sole trader (เจ้าของคนเดียว) — the tax id is then that person's own, and the
-- address is where they live — and are ordinary business data when the vendor is a company. The
-- table could not tell the two apart, so neither `@pdpa`-tagging the columns nor leaving them
-- untagged would have been true of every row. Thai PDPA protects natural persons only (a juristic
-- person is not a data subject), which is exactly the distinction this column records.
--
-- NULLABLE, AND DELIBERATELY NOT BACKFILLED. Nothing already in this schema distinguishes the two:
-- `tax_id` is stored as-is with no validation by design (Phase 5: "multi-country format, no
-- validation"), so its length or shape cannot be read as a type, and `vendor_name` is free text. A
-- backfill would therefore be a guess, and a guess here mislabels a real person's tax id as company
-- data. NULL means "not recorded", never "juristic" — the follow-up tagging migration
-- (20260816000002) treats NULL as unknown and the retention policy documents it that way.
--
-- Backward-compatible by construction (QM-9): a nullable column with no default and no constraint on
-- existing rows. Old code that does not select it is unaffected.
-- Rollback: prisma/rollbacks/20260816000001_add_vendor_type_to_vendors.rollback.sql

ALTER TABLE procurement.vendors
  ADD COLUMN IF NOT EXISTS vendor_type VARCHAR(10)
    CONSTRAINT vendors_vendor_type_check
    CHECK (vendor_type IN ('INDIVIDUAL', 'JURISTIC'));

COMMENT ON COLUMN procurement.vendors.vendor_type IS
  'INDIVIDUAL = natural person (sole trader); JURISTIC = company. NULL = not recorded. Decides whether tax_id/address on this row are personal data (PDPA protects natural persons only).';
