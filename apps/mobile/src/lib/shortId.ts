// A UUID shortened for display.
//
// The mockups print human ids that this product does not mint — `ID: SW-9281` on the account screen
// (05_site_worker/05_profile), `ID: #C4-8820` on a task card. There is no such column: `user_id` and
// `task_id` are UUIDs. Rather than invent an identifier scheme with no issuer, no uniqueness
// guarantee and nothing to look it up by, the real UUID is shortened to something a person can read
// aloud over a radio and an engineer can still grep for.
//
// In `src/lib/` so the screens, the drawer and the tests share ONE implementation — the task card
// grew its own copy first, and two rules for "the short form of an id" is one too many.

/**
 * The last EIGHT characters of a UUID's final block, upper-cased — `…-1554e2a1f0cd` → `E2A1F0CD`.
 *
 * The LAST block, not the first: in a v5/v1 UUID the leading bytes are the most likely to repeat
 * across rows minted together, so the tail discriminates better in a list. Eight characters is the
 * same length the task cards have used since 2026-08-08, and 32 bits is ample to tell apart the
 * handful of ids one person sees at once — it is a display aid, never a key.
 *
 * A value that is not a UUID is returned upper-cased and trimmed to the same width, so a seeded or
 * legacy id still renders as an id rather than overflowing the row.
 */
export function shortId(id: string | null | undefined): string {
  if (id == null || id.trim() === '') return '—';
  // `lastIndexOf` rather than `split('-').pop()`: pop() is typed `string | undefined` but can never
  // BE undefined here (split always yields at least one element), so that form carries a fallback
  // branch no test can reach. When there is no '-', lastIndexOf returns -1 and slice(0) is the whole
  // string, which is exactly the non-UUID behaviour documented above.
  return id
    .slice(id.lastIndexOf('-') + 1)
    .slice(-8)
    .toUpperCase();
}
