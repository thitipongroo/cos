// Initials for the header avatar (components/Avatar.tsx).
//
// Kept out of the component so the naming edge cases are testable. §11 platform.users has no photo
// until one is uploaded, so initials are what most accounts actually render.

/**
 * First character of a word, counted in code points.
 *
 * `word[0]` would split an astral character (𝒜 → a lone surrogate); the spread iterates code points.
 * The word is non-empty by construction — every caller passes an element of a `filter(Boolean)`
 * array — so the index always resolves.
 */
function firstCodePoint(word: string): string {
  return [...word][0]!;
}

/**
 * Up to two initials from a display name.
 *
 * Takes the first character of the first and last whitespace-separated parts, which is right for
 * both "Waraporn Klinhom" → WK and Thai names like "สมชาย ใจดี" → สใ. A single-word name yields one
 * letter rather than two, because slicing the second character out of a word is not an initial.
 *
 * Returns '' for an empty/missing name — the caller falls back to a person icon rather than drawing
 * an empty circle.
 */
export function initialsOf(displayName: string | null | undefined): string {
  const parts = (displayName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = firstCodePoint(parts[0]!);
  if (parts.length === 1) return first.toUpperCase();
  return (first + firstCodePoint(parts[parts.length - 1]!)).toUpperCase();
}

/**
 * The OTHER initials rule, as the three tenant-admin screens have always computed them.
 *
 * users.tsx, reset-password.tsx and user-profile.tsx each carried a byte-identical private copy of
 * this. Collapsed to one on 2026-08-20 — WITHOUT changing what any of them draws, because it is not
 * the same rule as `initialsOf` above and switching them would change initials that are on screen
 * today. The two differ in three ways:
 *
 *   | display name          | initialsOf | initialsFirstTwo |
 *   | --------------------- | ---------- | ---------------- |
 *   | "Waraporn Klinhom"    | WK         | WK               |
 *   | "Waraporn Klinhom Ltd"| WL         | WK               |  <- first + LAST vs first + SECOND
 *   | "Somchai"             | S          | S                |
 *   | ""                    | ''         | '?'              |  <- caller draws a glyph vs a literal ?
 *
 * and this one indexes with `[0]`, which returns half of an astral character (an emoji or a rare
 * CJK glyph in a name) where `initialsOf` iterates code points.
 *
 * FOR THE PRODUCT OWNER: one person can therefore show WL in the header avatar and WK on the user
 * list. `initialsOf` is the one with the stated reasoning — first and last is the convention, and it
 * is right for Thai names — so the likely answer is that these three screens move onto it and this
 * function goes. That is a visible change to what is drawn, which is why it is recorded here rather
 * than made. NEW CODE TAKES `initialsOf`.
 */
export function initialsFirstTwo(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}
