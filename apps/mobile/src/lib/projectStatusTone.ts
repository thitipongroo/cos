// What colour a PROJECT's lifecycle status reads as.
//
// The product owner asked whether the manager Home's "ACTIVE" chip should be green. It should, and
// the answer is not a taste call — two things in this codebase already point the same way:
//
//   - The drawing (mockup 06_project_manager/01_home) colours the healthy state green and leaves the
//     third card's "DRAFT" grey.
//   - `components/StatusChip.tsx` already maps DRAFT to the neutral token. It has no ACTIVE entry at
//     all, so today a project in that state renders grey everywhere StatusChip is used — including
//     the Executive's `/portfolio` list.
//
// Green for ACTIVE agrees with both instead of inventing a third convention, and this module is
// where the mapping lives so the two surfaces cannot drift apart. Tones, not colours: the manager
// Home paints from the dark palette and StatusChip from the light §32.7 tokens, and neither should
// have to know the other's.

/** The colour role a status takes, resolved to an actual colour by whatever is rendering it. */
export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

/**
 * Project lifecycle statuses (`ProjectStatus` in the Prisma schema).
 *
 * ACTIVE is the only state where work is running, so it is the only green one. A project on hold is
 * a project someone has to do something about — warning, not neutral. Anything not listed falls to
 * neutral rather than being guessed at, which is also what StatusChip does with an unknown label.
 */
const TONE: Readonly<Record<string, StatusTone>> = {
  ACTIVE: 'success',
  COMPLETED: 'success',
  ON_HOLD: 'warning',
  DRAFT: 'neutral',
  CANCELLED: 'neutral',
};

export function projectStatusTone(status: string | null | undefined): StatusTone {
  if (status == null) return 'neutral';
  return TONE[status.toUpperCase()] ?? 'neutral';
}
