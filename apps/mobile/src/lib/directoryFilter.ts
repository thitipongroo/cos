// The team directory's free-text filter (screen: app/(app)/directory.tsx).
//
// WHY IT LIVES HERE AND NOT IN THE SCREEN. Importing a screen drags in expo-router, which is ESM and
// dies under this CommonJS jest setup ("Cannot use import statement outside a module") — the same
// constraint that moved the tab table into `roleTabs.ts` and the landing rule into `landingRoute.ts`.
// Pure logic in `src/lib/` is also inside the 100%-coverage scope (jest.config.ts
// `collectCoverageFrom`), where a screen is not.

/** The fields of a directory card the filter reads — a structural subset of DirectoryEntry. */
export interface DirectoryFilterable {
  full_name: string;
  trade_type: string;
  role_on_project?: string | null;
}

/**
 * Case-insensitive match over a worker's name and job.
 *
 * Client-side because the whole crew is already in hand — a project has tens of workers, not
 * thousands — so a keystroke costs nothing and keeps working while the list is on screen.
 *
 * BOTH job fields are searched, not just one. The mockup's placeholder reads "ค้นหาชื่อหรือตำแหน่ง",
 * and a worker typing "foreman" means the job on THIS project (`role_on_project`), while one typing
 * "carpenter" means the trade the person was hired under (`trade_type`). Searching only the trade
 * would miss every foreman; only the role would miss everyone whose allocation left it blank.
 */
export function matchesDirectoryQuery(entry: DirectoryFilterable, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true; // an empty box is not a filter
  return [entry.full_name, entry.trade_type, entry.role_on_project ?? '']
    .join(' ')
    .toLowerCase()
    .includes(q);
}
