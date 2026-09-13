// Which screens hand you back to the NAVIGATION DRAWER rather than to whatever was behind them.
//
// ── THE PROBLEM THIS SOLVES ───────────────────────────────────────────────────────────────────
//
// `NavigationDrawer.go()` closes the drawer and then pushes. So Back from a screen the drawer opened
// landed on the previous screen with the drawer SHUT — and the user had to reopen it to reach the
// row beside the one they had just used. The drawer is this product's menu for every role (§32.7); a
// menu that closes itself every time you pick from it makes the second pick cost three taps rather
// than one.
//
// Product-owner decision 2026-09-13: Back from Account Settings and from Profile returns to the
// drawer, "เพราะว่ากดมาจากหน้านั้น" — because that is where it was pressed from.
//
// ── WHY A LIST AND NOT "EVERY DRAWER ROW" ─────────────────────────────────────────────────────
//
// The same argument would reach all nineteen routes the drawer can open, and it may yet. It is NOT
// extended here, because the other seventeen are also reachable from bottom tabs, quick actions and
// each other — so for them "you came from the drawer" is a guess about one of several entry points
// rather than a fact. These two are not: Account Settings is a `SHARED_LINKS` row, and Profile has
// exactly one way in, the drawer's profile card, which
// `tests/conformance/mobile/04-role-screens.spec.ts` holds that way. Adding a route here is one
// line, and this is where the argument for it belongs.
//
// ── BOTH BACK GESTURES, ONE RULE ──────────────────────────────────────────────────────────────
//
// A child screen has two Backs: the TopBar chevron and Android's hardware button. They are handled
// in different files — `components/TopBar.tsx` and `app/(app)/_layout.tsx` — so the rule lives here
// rather than in either of them. Written twice, they would drift, and which gesture the user
// happened to reach for would decide what the app did.

/**
 * Paths whose Back reopens the navigation drawer.
 *
 * Compared EXACTLY against `usePathname()`, which yields a leading-slash path with no group segment
 * — `/account-settings`, never `/(app)/account-settings`. Exact rather than prefix: a prefix test
 * would also catch a future `/profile-something`, and quietly.
 */
export const DRAWER_RETURN_ROUTES: readonly string[] = ['/account-settings', '/profile'];

/** Does Back from this path reopen the navigation drawer? */
export function returnsToDrawer(pathname: string | null | undefined): boolean {
  return pathname != null && DRAWER_RETURN_ROUTES.includes(pathname);
}
