// Route registration guard.
//
// This suite reads the real source files rather than importing them, because what it is checking is
// not runtime behaviour — it is that two hand-maintained maps in two components stay in step with the
// set of files on disk. Importing MobileNav would pull in expo-router and the whole navigator; the
// registration is plain text in a JSX list, and reading it is both cheaper and closer to the thing
// that actually breaks.
//
// The failure it exists to prevent has happened twice already: a new screen under (app)/ without an
// explicit `href: null` is auto-registered by expo-router as a VISIBLE bottom tab, and mfa-enrollment
// and notification-preferences both shipped onto every role's bottom bar that way.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { E2E_ROUTE_DIR, TAB_ROUTES, TERMINAL_ROUTES } from '../routeRegistry';

const APP_DIR = join(__dirname, '..', '..', 'app', '(app)');
const COMPONENTS = join(__dirname, '..', '..', 'components');

/** Every route file under (app)/, by route name. `_layout` is the shell, not a route. */
function routeFiles(): string[] {
  return readdirSync(APP_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.tsx') && e.name !== '_layout.tsx')
    .map((e) => e.name.replace(/\.tsx$/, ''));
}

const mobileNav = readFileSync(join(COMPONENTS, 'MobileNav.tsx'), 'utf8');
const breadcrumb = readFileSync(join(COMPONENTS, 'Breadcrumb.tsx'), 'utf8');

/** Route names MobileNav explicitly hides from the tab bar. */
const hidden = new Set(
  [...mobileNav.matchAll(/<Tabs\.Screen\s+name="([^"]+)"\s+options=\{\{\s*href:\s*null/g)].map(
    (m) => m[1]!,
  ),
);

/** Route paths that have a breadcrumb chain — which is also what gives them a TopBar Back control. */
const withBreadcrumb = new Set(
  [...breadcrumb.matchAll(/^\s{2}'\/([a-z0-9-]+)':\s*\[/gm)].map((m) => m[1]!),
);

describe('every (app) route is registered', () => {
  it('has no route file that would auto-register as a visible tab', () => {
    // THE ASSERTION THIS FILE EXISTS FOR. Anything that is neither a declared tab nor explicitly
    // hidden is, right now, on the bottom bar of every role that can reach it.
    const leaking = routeFiles().filter(
      (r) => !(TAB_ROUTES as readonly string[]).includes(r) && !hidden.has(r),
    );
    expect(leaking).toEqual([]);
  });

  it('gives every pushed child screen a breadcrumb, so it also gets a Back control', () => {
    // `isChildRoute` reads BREADCRUMB_MAP, and TopBar reads `isChildRoute`. A pushed screen missing
    // from the map is a screen with no way back except the hardware button.
    const pushed = routeFiles().filter(
      (r) =>
        !(TAB_ROUTES as readonly string[]).includes(r) &&
        !(TERMINAL_ROUTES as readonly string[]).includes(r),
    );
    const missing = pushed.filter((r) => !withBreadcrumb.has(r));
    expect(missing).toEqual([]);
  });

  it('leaves terminal screens out of the breadcrumb map', () => {
    // Reached with router.replace — there is nothing behind them, so a Back control would either do
    // nothing or drop the user into a flow they have already completed.
    const wrong = TERMINAL_ROUTES.filter((r) => withBreadcrumb.has(r));
    expect(wrong).toEqual([]);
  });

  it('keeps the E2E routes outside the tab navigator entirely', () => {
    // They sit at src/app/e2e/ — a SIBLING of (app), not a directory inside it — so expo-router never
    // surfaces them as tabs and MobileNav has nothing to declare. If one were ever moved into (app)
    // as a flat file, the first assertion would catch it; this one pins down why it is absent from
    // every list above.
    const siblings = readdirSync(join(APP_DIR, '..'), { withFileTypes: true });
    expect(siblings.some((e) => e.isDirectory() && e.name === E2E_ROUTE_DIR)).toBe(true);
    expect(routeFiles()).not.toContain(E2E_ROUTE_DIR);
  });

  it('does not hide a route that no longer exists', () => {
    // A stale href:null is harmless at runtime but hides the fact that a screen was deleted. This
    // keeps the list honest in the other direction too.
    const files = new Set(routeFiles());
    expect([...hidden].filter((r) => !files.has(r))).toEqual([]);
  });

  it('does not name a breadcrumb route that no longer exists', () => {
    const files = new Set(routeFiles());
    expect([...withBreadcrumb].filter((r) => !files.has(r))).toEqual([]);
  });

  it('declares no route as both a tab and hidden', () => {
    const both = TAB_ROUTES.filter((r) => hidden.has(r));
    expect(both).toEqual([]);
  });
});
