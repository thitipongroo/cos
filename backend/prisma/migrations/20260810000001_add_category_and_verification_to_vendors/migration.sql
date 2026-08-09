-- Two facts about a vendor that the app had nowhere to put: what it supplies, and whether anyone has
-- checked it out.
--
-- Source: mockup/mobile/06_project_manager/03_vendors/01_vendor_directory — the directory filters by
-- Materials / Logistics / Services / Equipment and badges each vendor VERIFIED or UNDER REVIEW.
-- `procurement.vendors` carried only identity and contact details, so neither the filter nor the badge
-- had a column behind it. Product-owner decision 2026-08-10: add the columns rather than drop the
-- controls from the screen.
--
-- WHY category IS NOT `wht_rules.vendor_type`. That column already holds 'services' / 'rent' / 'goods'
-- and looks like the same idea, but it is a WITHHOLDING-TAX classification (spec §13.3) — it decides
-- the WHT rate, and Thai revenue rules group trades differently from the way a buyer browses a
-- directory. Overloading it would make a tax rate move when someone re-filed a vendor under a
-- friendlier heading. Two facts, two columns.
--
-- WHAT verification_status IS. A record that the tenant has checked the vendor's documents — nothing
-- more. It is NOT a performance judgement: that is the vendor score (G-W5,
-- procurement/vendor-scoring.ts), computed from on-time delivery, dispute rate and price. The mockup
-- also draws a TOP RATED badge, and it is deliberately NOT stored here — it is derived from that
-- score's existing grade-A threshold (≥ 90), so the platform keeps ONE source of truth for "this
-- vendor is good" instead of a stored label that drifts away from the measured one.
--
-- Backward-compatible (QM-9): both columns are additive and NULLABLE, so deployed code that never
-- writes them keeps working. NULL is meaningful and correct for every existing row — nobody has
-- categorised or reviewed any of them, and defaulting to 'PENDING' would assert a review queue that
-- no one has actually put them in.
--
-- Rollback: prisma/rollbacks/20260810000001_add_category_and_verification_to_vendors.rollback.sql

ALTER TABLE procurement.vendors
  ADD COLUMN IF NOT EXISTS category VARCHAR(20)
    CONSTRAINT vendors_category_check
    CHECK (category IN ('MATERIALS', 'LOGISTICS', 'SERVICES', 'EQUIPMENT'));

ALTER TABLE procurement.vendors
  ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20)
    CONSTRAINT vendors_verification_status_check
    CHECK (verification_status IN ('PENDING', 'VERIFIED', 'REJECTED'));

-- The directory filters on (tenant, category) and lists active vendors only.
CREATE INDEX IF NOT EXISTS idx_vendors_tenant_category
  ON procurement.vendors (tenant_id, category)
  WHERE is_active = true;

COMMENT ON COLUMN procurement.vendors.category IS
  'INTERNAL — what the vendor supplies, for directory browsing: MATERIALS | LOGISTICS | SERVICES | EQUIPMENT. NULL = uncategorised. NOT a tax classification (see procurement.wht_rules.vendor_type).';

COMMENT ON COLUMN procurement.vendors.verification_status IS
  'INTERNAL — document-check state only: PENDING | VERIFIED | REJECTED. NULL = never submitted for review. NOT a performance rating — that is the vendor score (procurement/vendor-scoring.ts).';
