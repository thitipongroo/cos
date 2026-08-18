// Shortening a hex digest for display (ADR-092; product-owner decision 2026-08-18).
//
// `mockup/mobile/01_authen/04_terms_of_use/02_terms_of_use_download` prints `SHA-256: 8a7f...e210` —
// four leading characters, an ellipsis, four trailing ones — and the receipt screen now follows it.
// The screen shipped with the full 64-character digest instead, on the reasoning that a digest a
// reader cannot compare is decoration; the product owner ruled for the drawing, and the full value is
// kept on the row's accessibilityLabel so it remains recoverable.
//
// In lib/ rather than in the screen: src/lib is inside the 100/100 coverage gate, and the edge case
// below is exactly the kind that goes unnoticed in a component.

/** Characters kept at each end, from the drawing's `8a7f...e210`. */
const EDGE = 4;

/**
 * `8a7f...e210` — the drawing's shape.
 *
 * A digest too short to abbreviate is returned WHOLE. Slicing it anyway would print overlapping
 * characters (`abcd...abcd` for an 8-character input), which reads as a real abbreviation of a longer
 * value and is worse than showing the short thing itself.
 */
export function abbreviateDigest(digest: string): string {
  if (digest.length <= EDGE * 2) return digest;
  return `${digest.slice(0, EDGE)}...${digest.slice(-EDGE)}`;
}
