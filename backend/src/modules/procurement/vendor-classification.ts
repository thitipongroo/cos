// The two vendor classification vocabularies, in one place.
//
// They exist as runtime arrays (not just union types) because three layers need the SAME list and
// must not drift: the DTO's @IsIn validator, the query-parameter guard on the directory endpoint, and
// the CHECK constraints in migration 20260810000001. A union type alone is erased at compile time and
// would leave the wire unguarded.
//
// Changing either list means a migration — the database CHECK is the real gate, and a value this file
// accepts but the constraint rejects surfaces as a 500 at INSERT time rather than a 400 at the edge.

/**
 * What a vendor supplies. Source: the directory's filter chips
 * (drawn in the `mockup/mobile/06_project_manager` set the product owner replaced on 2026-08-10 —
 * that drawing is withdrawn, and the vendor directory now hangs off the More menu instead. The
 * classification below outlived the drawing because it describes vendor DATA, not a screen.)
 *
 * NOT the withholding-tax classification — `finance.wht_rules.service_type` is a different
 * vocabulary serving a different purpose (spec §13.3), and conflating them would make a tax rate move
 * when someone re-files a vendor under a friendlier heading.
 */
export const VENDOR_CATEGORIES = ['MATERIALS', 'LOGISTICS', 'SERVICES', 'EQUIPMENT'] as const;
export type VendorCategoryName = (typeof VENDOR_CATEGORIES)[number];

/**
 * Whether the tenant has checked the vendor's documents. Nothing to do with how well it performs —
 * that is the vendor score (vendor-scoring.ts), and the directory's TOP RATED badge is derived from
 * that score's grade-A threshold rather than stored here.
 */
export const VENDOR_VERIFICATION_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED'] as const;
export type VendorVerificationStatusName = (typeof VENDOR_VERIFICATION_STATUSES)[number];

/** Type guard so a string off the wire can be narrowed before it reaches the CHECK constraint. */
export function isVendorCategory(value: string): value is VendorCategoryName {
  return (VENDOR_CATEGORIES as readonly string[]).includes(value);
}
