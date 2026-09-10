// countByStatus — how many rows sit behind each chip of a counted filter row.
//
// Counts the WHOLE fetched list, never the filtered view: a chip whose number changed when you
// pressed it would be reporting its own effect rather than the list. `ALL` is the total, and every
// status present gets its own entry — including one the caller draws no chip for, which costs
// nothing and means a new status never silently counts as zero.
//
// In `src/lib/` rather than beside either screen because both CRM lists compute it and it is pure:
// the logic suite holds it at 100% (QM-1), where a render test could only observe it indirectly
// through a chip label.

/** The key the total is filed under. No status may use it — none does; they are all SCREAMING_CASE nouns. */
export const ALL = 'ALL';

export function countByStatus<T extends { status: string }>(
  rows: readonly T[],
): Record<string, number> {
  const by: Record<string, number> = { [ALL]: rows.length };
  for (const row of rows) by[row.status] = (by[row.status] ?? 0) + 1;
  return by;
}
