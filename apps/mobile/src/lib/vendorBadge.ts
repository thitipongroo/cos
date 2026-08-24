// Which single badge a vendor card shows.
//
// The mockup (role_proc_manager/03_vendors) draws three: VERIFIED, UNDER REVIEW and TOP RATED. Only
// the first two are stored — `procurement.vendors.verification_status` records a document check.
// TOP RATED is DERIVED from the vendor score's grade-A threshold (≥ 90, backend vendor-scoring.ts),
// deliberately: storing "this vendor is good" a second time would let the badge drift away from the
// measured score, and the platform would then hold two answers to the same question.
//
// In `src/lib/` so it is unit-testable and inside the 100%-coverage scope, like the other pure
// display rules (see `approvalUrgency.ts` for the same note).

/** Verification state as the API returns it. NULL = never submitted for review. */
export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | null;

/** Score grade as the scorecard endpoint returns it. NULL = no history to score yet. */
export type ScoreGrade = 'A' | 'B' | 'C' | 'D' | 'F' | null;

/** What the card renders. `null` = no badge at all, which is honest for an unreviewed vendor. */
export type VendorBadge = 'TOP_RATED' | 'VERIFIED' | 'UNDER_REVIEW' | 'REJECTED' | null;

/**
 * One badge per card, in the mockup's visual hierarchy: the card has room for exactly one.
 *
 * TOP RATED OUTRANKS VERIFIED because it is the stronger statement AND it implies the weaker one —
 * it is only offered to a vendor whose papers are already in order. A grade-A vendor that has NOT
 * been verified keeps showing its verification state instead: a measured score says nothing about
 * whether anyone checked the company's documents, and letting performance mask that gap is exactly
 * the conflation this split exists to prevent.
 *
 * REJECTED is never masked by anything.
 */
export function vendorBadge(status: VerificationStatus, grade: ScoreGrade): VendorBadge {
  if (status === 'REJECTED') return 'REJECTED';
  if (status === 'VERIFIED') return grade === 'A' ? 'TOP_RATED' : 'VERIFIED';
  if (status === 'PENDING') return 'UNDER_REVIEW';
  return null;
}
