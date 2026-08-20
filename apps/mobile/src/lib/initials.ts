// Initials for every avatar in the app.
//
// Kept out of the components so the naming edge cases are testable. §11 platform.users has no photo
// until one is uploaded, so initials are what most accounts actually render.
//
// ONE RULE, APP-WIDE (PO 2026-08-20). users.tsx, reset-password.tsx and user-profile.tsx used to
// carry a private copy that took the first TWO parts of a name and returned '?' when it could read
// none — so one person showed WS on the top-bar avatar and WK on the user list, and a name it could
// not read drew a literal question mark on two screens and a person glyph on a third. That copy is
// gone; the rule below is the only one, and where it returns '' the caller draws a person glyph
// sized at half its avatar box (the ratio the directory and the user card already used).

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
