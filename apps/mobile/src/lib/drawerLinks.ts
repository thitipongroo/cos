// What each role sees in the navigation drawer.
//
// TWO ENTRIES ARE SHARED AND THE REST ARE NOT — product-owner decision 2026-08-10. The drawer used to
// show one identical list to all twelve roles, which meant a Site Worker and an Executive were
// offered the same six screens regardless of what either could do with them. Settings and the
// Support Centre are the only two every role gets; everything else is that role's own set.
//
// WHY THIS IS DATA IN `src/lib/`, like roleTabs.ts. It is a table, two things read it (the drawer and
// its spec), and importing NavigationDrawer from a test drags in expo-router, which is ESM and dies
// under this CommonJS jest setup. This module imports nothing at runtime but `@cos/types` and the tab
// table, so it stays importable anywhere.
//
// A DRAWER ENTRY IS NEVER ALSO A TAB. The role's four tabs are already one tap away at the bottom of
// every screen; a drawer row onto the same route is a second door onto the same room. That rule used
// to be a hand-maintained exception for one role (`SITE_WORKER` and Directory); `drawerLinksFor`
// applies it to every role from the tab table itself, so it cannot fall out of date.

import type { MaterialIcons } from '@expo/vector-icons';
import { CosRole } from '@cos/types';
import { ALL_TABS } from './roleTabs';

export interface DrawerLink {
  route: string;
  labelKey: string;
  icon: keyof typeof MaterialIcons.glyphMap;
}

const PROJECTS: DrawerLink = { route: '/projects', labelKey: 'drawer.projects', icon: 'dashboard' };
const REPORTS: DrawerLink = { route: '/reports', labelKey: 'drawer.reports', icon: 'description' };
const INCIDENTS: DrawerLink = {
  route: '/incidents',
  labelKey: 'drawer.incidents',
  icon: 'health-and-safety',
};
const INSPECTIONS: DrawerLink = {
  route: '/inspections',
  labelKey: 'drawer.inspections',
  icon: 'fact-check',
};
const MATERIALS: DrawerLink = {
  route: '/material-request',
  labelKey: 'drawer.materials',
  icon: 'inventory-2',
};
const DELIVERIES: DrawerLink = {
  route: '/deliveries',
  labelKey: 'drawer.deliveries',
  icon: 'local-shipping',
};
const DIRECTORY: DrawerLink = { route: '/directory', labelKey: 'directory.title', icon: 'groups' };
const DASHBOARD: DrawerLink = {
  route: '/dashboard',
  labelKey: 'nav.tabs.dashboard',
  icon: 'insights',
};
const ISSUES: DrawerLink = {
  route: '/issues',
  labelKey: 'nav.tabs.issues',
  icon: 'report-problem',
};

/**
 * The two rows every role gets (PO 2026-08-10).
 *
 * Settings is the signed-in user's own account. The Support Centre lives at `/support` — a route in
 * the `(auth)` group, which costs nothing here: expo-router groups add no path segment, and that
 * screen carries its own Back control, so it returns the user where they came from. It was reachable
 * only from the login footer before this, which left a signed-in user with no way to ask for help.
 */
export const SHARED_LINKS: readonly DrawerLink[] = [
  { route: '/account-settings', labelKey: 'drawer.settings', icon: 'settings' },
  { route: '/support', labelKey: 'drawer.support', icon: 'support-agent' },
];

/**
 * PROJECT_MANAGER — the only role with a drawer DRAWING
 * (mockup 06_project_manager/05_navigation_drawer).
 *
 * Its seven items map to six real screens plus one that does not exist:
 *   Project Dashboard  → `/dashboard`        the manager analytics screen
 *   Daily Site Reports → `/reports`
 *   Material Inventory → `/material-request`
 *   Issue Management   → `/issues`
 *   Safety Compliance  → `/incidents`        the safety-event register, not `/safety-checklist`:
 *                                            the checklist is the worker's daily FORM, an action;
 *                                            a manager opening "compliance" is reviewing what
 *                                            happened, which is the register.
 *   System Settings    → in SHARED_LINKS
 *   BIM Progress Audit → NOTHING. `00-glossary.md`: "Full BIM integration is post-MVP". It is left
 *                        out rather than linked to a dead path or stubbed.
 *
 * `/projects` is here although the drawing does not name it: this role's Projects TAB was given up
 * on 2026-08-10 for Finance and More, and a screen must not lose its last entry point in a bar swap.
 */
const PROJECT_MANAGER_LINKS: readonly DrawerLink[] = [
  DASHBOARD,
  PROJECTS,
  REPORTS,
  MATERIALS,
  ISSUES,
  INCIDENTS,
  DIRECTORY,
];

/**
 * Every other role — UNCHANGED from the single shared list, on purpose.
 *
 * The product owner's ruling is that each role gets its own set, and exactly one role has a drawing
 * that says what its set is. Cutting the other eleven down to a guess would remove entry points
 * nobody asked to remove, so they keep what they have until their own drawer mockup arrives. This is
 * the honest halfway state, and the list below is the place each of them gets edited.
 */
const DEFAULT_LINKS: readonly DrawerLink[] = [
  PROJECTS,
  REPORTS,
  INCIDENTS,
  INSPECTIONS,
  MATERIALS,
  DELIVERIES,
];

/**
 * Directory is offered to the roles whose people are IN a project crew — the field roles and the
 * manager who staffs them. Unchanged from the rule this file inherited.
 */
const DIRECTORY_ROLES: readonly CosRole[] = [CosRole.SITE_ENGINEER, CosRole.SAFETY_OFFICER];

/** The routes that are bottom tabs for `role` — a drawer row onto one of them would be a duplicate. */
function tabRoutesFor(role: CosRole): Set<string> {
  return new Set(ALL_TABS.filter((tab) => tab.roles.includes(role)).map((tab) => `/${tab.name}`));
}

/**
 * The role's own drawer section, above the shared rows.
 *
 * A signed-out or unknown role gets nothing role-specific — the drawer then shows only the two
 * shared rows, which is what a session with no role can honestly offer.
 */
export function drawerLinksFor(role: CosRole | null | undefined): readonly DrawerLink[] {
  if (role == null) return [];
  const base =
    role === CosRole.PROJECT_MANAGER
      ? PROJECT_MANAGER_LINKS
      : DIRECTORY_ROLES.includes(role)
        ? [...DEFAULT_LINKS, DIRECTORY]
        : DEFAULT_LINKS;
  const tabs = tabRoutesFor(role);
  return base.filter((link) => !tabs.has(link.route));
}
