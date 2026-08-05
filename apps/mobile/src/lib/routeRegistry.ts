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
  'dashboard',
  'projects',
  'tasks',
  'issues',
  'inspections',
  'reports',
  'report',
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
