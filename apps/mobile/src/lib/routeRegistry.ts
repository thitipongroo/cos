// The (app) route registry — every route file, and how it must be registered.
//
// WHY A LIST RATHER THAN A CONVENTION. expo-router auto-registers every file under `(app)/` as a
// VISIBLE bottom tab unless MobileNav declares `<Tabs.Screen href={null} />` for it. That default has
// already leaked twice — mfa-enrollment and notification-preferences both appeared on every role's
// bottom bar before someone noticed — and it leaked again when the seven D-series screens landed.
//
// A comment asking the next author to remember is what failed the first two times. This module makes
// the requirement checkable, and `routeRegistry.spec.ts` reads the actual source files, so a screen
// added without its `href: null` fails a test instead of shipping onto four bottom bars.

/**
 * Routes that are legitimately bottom tabs for at least one role (§32.7).
 *
 * Everything else under `(app)/` is reached by `router.push` and must be hidden from the tab bar.
 */
export const TAB_ROUTES = [
  'home',
  // `dashboard` IS NOT HERE. It stopped being any role's tab on 2026-08-10 (its content is Home for
  // the two manager roles, mockup 06_project_manager/01_home) and so it left ALL_TABS — which means
  // MobileNav no longer declares it from the tab table and expo-router auto-registers it as a VISIBLE
  // tab unless something says otherwise. It was briefly left in this list with a comment claiming
  // MobileNav still declared it; that claim was wrong, the guard passed on it, and the role's bar
  // shipped with FIVE tabs (a lowercase "dashboard" beside Vendors) until a capture showed it.
  // Anything that leaves ALL_TABS must leave this list too and gain an explicit `href: null`.
  'projects',
  // `approvals` IS GONE — its route file was deleted on 2026-08-10 when the corrected mockup set put
  // the approvals queue inside the Procurement tab instead of on a tab of its own.
  //
  // `vendors` IS NOT HERE EITHER, since 2026-08-10. It left ALL_TABS when the Project Manager's bar
  // became Home | Procurement | Finance | More, and its screen is now the pushed child behind More's
  // vendor tile. That is exactly the move that leaked a fifth tab when `dashboard` made it (see
  // above), so it left this list in the same commit and gained `href: null` + a breadcrumb.
  // `tasks` is a tab again (PO 2026-08-09) — SITE_WORKER's bar is Home | Tasks | Safety | Directory.
  'tasks',
  'directory',
  'issues',
  'inspections',
  // The Safety Officer's fourth tab (PO decision 2026-08-13). §20.7.7 `/safety/permits`; §6.4's
  // "Permits" row gives the role RW, and master §9 ends the permit approval chain at it.
  'permits',
  'reports',
  // `report` is deliberately ABSENT: the daily-entry form stopped being a tab on 2026-08-09 when
  // Tasks and Directory took the Site Worker's last two slots. It is pushed from the Home FAB's
  // quick-action menu, so it needs `href: null` + a breadcrumb like every other child screen.
  // SITE_WORKER's fourth tab (PO 2026-08-08, mockup 05_site_worker/03_safety/01_sw_checklist). A tab, not a pushed
  // child: the daily safety verification is one of the four things that role opens the app to do.
  'safety-checklist',
  'sync-queue',
  'alerts',
  'incidents',
  'deliveries',
  'orders',
  'rfqs',
  'procurement',
  'invoices',
  'payments',
  'budget',
  // The Project Manager's third and fourth tabs (corrected mockup set, 2026-08-10).
  'finance',
  'more',
  'portfolio',
  'customers',
  'leads',
  'opportunities',
  'users',
  'system-settings',
] as const;

// NOT tabs, despite an out-of-date comment in MobileNav claiming they are declared in ALL_TABS:
// `notifications` and `notification-preferences` both carry an unconditional `href: null` and appear
// in no role's tab set. They are reached from the top-bar bell and from Settings.

/**
 * Terminal screens: reached with `router.replace`, with nothing to go back to.
 *
 * They are deliberately absent from BREADCRUMB_MAP, which is also what denies them the TopBar's Back
 * control — `isChildRoute` is the single source of "has a parent", so the two cannot disagree.
 */
export const TERMINAL_ROUTES = [
  'invitation-success',
  'permission-success',
  'reset-password-success',
  'reset-password-email-success',
] as const;

/**
 * Routes that exist only for the E2E harness and never appear in the app shell.
 *
 * They live at `src/app/e2e/` — a SIBLING of `(app)`, not a directory inside it — so they are outside
 * the tab navigator entirely and MobileNav has nothing to declare for them.
 */
export const E2E_ROUTE_DIR = 'e2e';
