// What each role sees in the navigation drawer.
//
// TWO ENTRIES ARE SHARED AND THE REST ARE NOT — product-owner decision 2026-08-10. The drawer used to
// show ONE list to every role, and that list was not neutral: it was the TENANT_ADMIN drawer drawing
// (mockup 04_tenant_admin/05_navigation_drawer) plus two extra rows, handed to all twelve. A Site
// Worker was being offered the administrator's menu.
//
// WHERE EACH ROLE'S LIST COMES FROM (PO decision 2026-08-10, after the mockup set was searched):
//
//   - Exactly TWO roles have a drawer DRAWING — `04_tenant_admin/05_navigation_drawer` and
//     `06_project_manager/05_navigation_drawer`. The other roles' `05_profile` / `04_profile` folders
//     are Account Settings screens (Dark Mode, Biometric, MFA), not drawers. Those two roles get
//     their drawing; a drawing beats a derivation.
//   - Every other role's list is DERIVED from spec §6.4's module permission matrix (and §6.8 for the
//     three sub-roles): a row appears if that role's cell is anything other than `—`. So the drawer
//     offers a role exactly the screens it may actually open, and no row can lead to a 403.
//
// SAFETY_OFFICER NOW HAS A DRAWER DRAWING AND IT IS DELIBERATELY NOT ADOPTED (PO decision
// 2026-08-13). `mockup/mobile/07_safety_officer/05_profile/01_sa_drawer` arrived on a parallel branch
// (82ad50c7, merged at 377c361a) and heads a "Site Operations" section with four rows. Not one of
// them can be built as drawn:
//
//   Safety Protocols     — appears nowhere in §6.4, §20, §21 or master. UNSPECIFIED.
//   Equipment Certs      — §6.4 "Equipment" gives Safety `—`. The row would 403.
//   Workforce Compliance — §6.4 "Workforce attendance" gives Safety `—`. The row would 403.
//   Incident History     — `/incidents` is one of this role's four TABS, and a drawer row onto a tab
//                          is the second door onto one room that the rule below forbids.
//
// Its System section (Offline Sync → /sync-queue, Help Center → /support, Settings →
// /account-settings) is what SHARED_LINKS and the sync-queue row already provide. So the drawing adds
// nothing this app can honour, and ADR-085 is the reason that is allowed: a mockup is authoritative
// for STYLE, not for COMPOSITION. This is recorded here rather than left silent because an
// unexplained gap between a drawing and the code cannot be told apart from an oversight — which is
// exactly how the transparency hub's rows were once flagged as a defect when they were correct.
//
// THE ROUTE → MODULE MAP IS THE HONEST PART, and it is deliberately incomplete. A route is derived
// only where §6.4 names the module it reads. `/directory`, `/dashboard` and `/issues` are NOT
// derived — see the note above each — because no row in that matrix governs them, and inventing a
// mapping would put the spec's authority behind a guess.
//
// A DRAWER ENTRY IS NEVER ALSO A TAB. The role's four tabs are already one tap away at the bottom of
// every screen; a drawer row onto the same route is a second door onto the same room. That rule used
// to be a hand-maintained exception for one role; `drawerLinksFor` applies it to every role from the
// tab table itself, so it cannot fall out of date.
//
// WHY THIS IS DATA IN `src/lib/`, like roleTabs.ts. It is a table, two things read it (the drawer and
// its spec), and importing NavigationDrawer from a test drags in expo-router, which is ESM and dies
// under this CommonJS jest setup.

import type { MaterialIcons } from '@expo/vector-icons';
import { CosRole } from '@cos/types';
import { overflowTabsFor, visibleTabsFor } from './roleTabs';

export interface DrawerLink {
  route: string;
  labelKey: string;
  icon: keyof typeof MaterialIcons.glyphMap;
}

// ── the link catalogue ────────────────────────────────────────────────────────
// Labels keep the drawer's own wording where the mockups gave it one ("Project overview", "Daily
// site reports") and reuse the tab label otherwise, so one screen is named one way per surface.

const PROJECTS: DrawerLink = { route: '/projects', labelKey: 'drawer.projects', icon: 'dashboard' };
const TASKS: DrawerLink = { route: '/tasks', labelKey: 'nav.tabs.tasks', icon: 'assignment' };
const REPORTS: DrawerLink = { route: '/reports', labelKey: 'drawer.reports', icon: 'description' };
const INSPECTIONS: DrawerLink = {
  route: '/inspections',
  labelKey: 'drawer.inspections',
  icon: 'fact-check',
};
const SAFETY_CHECKLIST: DrawerLink = {
  route: '/safety-checklist',
  labelKey: 'nav.tabs.safety',
  icon: 'health-and-safety',
};
const INCIDENTS: DrawerLink = {
  route: '/incidents',
  labelKey: 'drawer.incidents',
  icon: 'health-and-safety',
};
const PERMITS: DrawerLink = {
  route: '/permits',
  labelKey: 'nav.tabs.permits',
  icon: 'assignment-turned-in',
};
const MATERIALS: DrawerLink = {
  route: '/material-request',
  labelKey: 'drawer.materials',
  icon: 'inventory-2',
};
const RFQS: DrawerLink = { route: '/rfqs', labelKey: 'nav.tabs.rfqs', icon: 'request-quote' };
const ORDERS: DrawerLink = { route: '/orders', labelKey: 'nav.tabs.orders', icon: 'inventory-2' };
const DELIVERIES: DrawerLink = {
  route: '/deliveries',
  labelKey: 'drawer.deliveries',
  icon: 'local-shipping',
};
const INVOICES: DrawerLink = {
  route: '/invoices',
  labelKey: 'nav.tabs.invoices',
  icon: 'receipt-long',
};
const VENDORS: DrawerLink = { route: '/vendors', labelKey: 'nav.tabs.vendors', icon: 'storefront' };
const BUDGET: DrawerLink = {
  route: '/budget',
  labelKey: 'nav.tabs.budget',
  icon: 'account-balance-wallet',
};
const PAYMENTS: DrawerLink = {
  route: '/payments',
  labelKey: 'nav.tabs.payments',
  icon: 'payments',
};
const PORTFOLIO: DrawerLink = {
  route: '/portfolio',
  labelKey: 'nav.tabs.portfolio',
  icon: 'pie-chart',
};
const LEADS: DrawerLink = { route: '/leads', labelKey: 'nav.tabs.leads', icon: 'person-add' };
const OPPORTUNITIES: DrawerLink = {
  route: '/opportunities',
  labelKey: 'nav.tabs.opportunities',
  icon: 'trending-up',
};
const CUSTOMERS: DrawerLink = {
  route: '/customers',
  labelKey: 'nav.tabs.customers',
  icon: 'business',
};
const USERS: DrawerLink = { route: '/users', labelKey: 'nav.tabs.users', icon: 'group' };

// Not derived — §6.4 names no module that governs them.
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

const {
  TENANT_ADMIN,
  EXECUTIVE,
  PROJECT_MANAGER,
  PROCUREMENT_OFFICER,
  FINANCE,
  SAFETY_OFFICER,
  SITE_ENGINEER,
  CRM_SALES_MANAGER,
  PROC_MANAGER,
  SITE_WORKER,
  VIEWER,
} = CosRole;

/**
 * Route → the roles §6.4 (and §6.8) grant something other than `—` on the module behind it.
 *
 * The `module` field is the row's exact heading in `docs/specifications/06-rbac-permission-matrix.md`,
 * so any cell that changes there can be found here. Order is display order.
 *
 * SYSTEM_ADMIN appears nowhere: §6.7 makes it a cross-tenant platform role that is never provisioned
 * into a tenant, so it has no tenant module row to read.
 */
const DERIVED: readonly { link: DrawerLink; module: string; roles: readonly CosRole[] }[] = [
  {
    link: PROJECTS,
    module: 'Project (view)',
    roles: [
      EXECUTIVE,
      PROJECT_MANAGER,
      SITE_ENGINEER,
      PROCUREMENT_OFFICER,
      FINANCE,
      SAFETY_OFFICER,
      CRM_SALES_MANAGER,
      TENANT_ADMIN,
      PROC_MANAGER,
      SITE_WORKER,
      VIEWER,
    ],
  },
  {
    link: TASKS,
    module: 'Tasks',
    roles: [
      EXECUTIVE,
      PROJECT_MANAGER,
      SITE_ENGINEER,
      PROCUREMENT_OFFICER,
      SAFETY_OFFICER,
      TENANT_ADMIN,
      SITE_WORKER,
      VIEWER,
    ],
  },
  {
    link: REPORTS,
    module: 'Site reports',
    roles: [
      EXECUTIVE,
      PROJECT_MANAGER,
      SITE_ENGINEER,
      PROCUREMENT_OFFICER,
      FINANCE,
      SAFETY_OFFICER,
      TENANT_ADMIN,
      SITE_WORKER,
      VIEWER,
    ],
  },
  {
    link: INSPECTIONS,
    module: 'Inspections / QC',
    roles: [EXECUTIVE, PROJECT_MANAGER, SITE_ENGINEER, SAFETY_OFFICER, TENANT_ADMIN],
  },
  {
    link: SAFETY_CHECKLIST,
    module: 'Safety checklists',
    roles: [EXECUTIVE, PROJECT_MANAGER, SITE_ENGINEER, SAFETY_OFFICER, TENANT_ADMIN, SITE_WORKER],
  },
  {
    link: INCIDENTS,
    module: 'Safety incidents',
    roles: [EXECUTIVE, PROJECT_MANAGER, SITE_ENGINEER, SAFETY_OFFICER, TENANT_ADMIN, SITE_WORKER],
  },
  // §6.4 "Permits" — Executive R, PM RW, Site Engineer R, Safety RW, Tenant Admin FULL (ADR-064 also
  // folds building permits and company licences into this row). Added 2026-08-13 with the screen:
  // the route existed nowhere before, so no role could reach a permit outside SAFETY_OFFICER's new
  // tab — and this row is what gives the other four a way in without inventing a mapping.
  {
    link: PERMITS,
    module: 'Permits',
    roles: [EXECUTIVE, PROJECT_MANAGER, SITE_ENGINEER, SAFETY_OFFICER, TENANT_ADMIN],
  },
  {
    link: MATERIALS,
    module: 'Purchase requests',
    roles: [
      EXECUTIVE,
      PROJECT_MANAGER,
      SITE_ENGINEER,
      PROCUREMENT_OFFICER,
      FINANCE,
      TENANT_ADMIN,
      PROC_MANAGER,
      VIEWER,
    ],
  },
  {
    link: RFQS,
    module: 'RFQ',
    roles: [
      EXECUTIVE,
      PROJECT_MANAGER,
      PROCUREMENT_OFFICER,
      FINANCE,
      TENANT_ADMIN,
      PROC_MANAGER,
      VIEWER,
    ],
  },
  {
    link: ORDERS,
    module: 'Purchase orders',
    roles: [
      EXECUTIVE,
      PROJECT_MANAGER,
      PROCUREMENT_OFFICER,
      FINANCE,
      TENANT_ADMIN,
      PROC_MANAGER,
      VIEWER,
    ],
  },
  {
    link: DELIVERIES,
    module: 'Deliveries',
    roles: [
      EXECUTIVE,
      PROJECT_MANAGER,
      SITE_ENGINEER,
      PROCUREMENT_OFFICER,
      FINANCE,
      TENANT_ADMIN,
      PROC_MANAGER,
      VIEWER,
    ],
  },
  {
    link: INVOICES,
    module: 'Vendor Invoices (AP)',
    roles: [
      EXECUTIVE,
      PROJECT_MANAGER,
      PROCUREMENT_OFFICER,
      FINANCE,
      TENANT_ADMIN,
      PROC_MANAGER,
      VIEWER,
    ],
  },
  {
    link: VENDORS,
    module: 'Vendor management',
    roles: [
      EXECUTIVE,
      PROJECT_MANAGER,
      PROCUREMENT_OFFICER,
      FINANCE,
      TENANT_ADMIN,
      PROC_MANAGER,
      VIEWER,
    ],
  },
  {
    link: BUDGET,
    module: 'Budget (view)',
    roles: [
      EXECUTIVE,
      PROJECT_MANAGER,
      PROCUREMENT_OFFICER,
      FINANCE,
      TENANT_ADMIN,
      PROC_MANAGER,
      VIEWER,
    ],
  },
  { link: PAYMENTS, module: 'Payments', roles: [EXECUTIVE, FINANCE, TENANT_ADMIN, VIEWER] },
  {
    link: PORTFOLIO,
    module: 'Executive dashboard',
    roles: [EXECUTIVE, PROJECT_MANAGER, FINANCE, TENANT_ADMIN],
  },
  {
    link: CUSTOMERS,
    module: 'Customers',
    roles: [EXECUTIVE, PROJECT_MANAGER, FINANCE, CRM_SALES_MANAGER, TENANT_ADMIN],
  },
  {
    link: OPPORTUNITIES,
    module: 'Opportunities',
    roles: [EXECUTIVE, FINANCE, CRM_SALES_MANAGER, TENANT_ADMIN],
  },
  { link: LEADS, module: 'Leads', roles: [EXECUTIVE, CRM_SALES_MANAGER, TENANT_ADMIN] },
  { link: USERS, module: 'User management', roles: [EXECUTIVE, TENANT_ADMIN] },
];

/**
 * The roles offered `/directory`, which §6.4 does not govern.
 *
 * The team directory is a crew contact list. No row in the matrix names it — "Workforce attendance"
 * is who turned up, not who to call — so this stays the explicit rule the file already carried
 * rather than being attached to a row it does not read.
 */
const DIRECTORY_ROLES: readonly CosRole[] = [SITE_ENGINEER, SAFETY_OFFICER];

/**
 * The two roles whose drawer is DRAWN, and what their drawing says.
 *
 * PROJECT_MANAGER — mockup 06_project_manager/05_navigation_drawer:
 *   Project Dashboard  → `/dashboard`
 *   Daily Site Reports → `/reports`
 *   Material Inventory → `/material-request`
 *   Issue Management   → `/issues`
 *   Safety Compliance  → `/incidents`   the safety-event REGISTER, not `/safety-checklist`: the
 *                                       checklist is the worker's daily form, an action; a manager
 *                                       opening "compliance" is reviewing what happened.
 *   System Settings    → in SHARED_LINKS
 *   BIM Progress Audit → NOTHING. `00-glossary.md`: "Full BIM integration is post-MVP".
 *   `/projects` is added although the drawing does not name it: this role's Projects TAB was given up
 *   on 2026-08-10 for Finance and More, and a screen must not lose its last entry point in a swap.
 *
 * TENANT_ADMIN — mockup 04_tenant_admin/05_navigation_drawer:
 *   Project Overview · Daily Site Reports · Safety Incident Logs · Material Inventory · Settings.
 *   Equipment Logs and Drawing Viewer are omitted — neither has a route in this app.
 *   This role could DERIVE far more (it holds FULL almost everywhere), and does not: its drawer was
 *   drawn, and the drawing is the narrower, deliberate answer.
 */
const DRAWN: Partial<Record<CosRole, readonly DrawerLink[]>> = {
  [PROJECT_MANAGER]: [DASHBOARD, PROJECTS, REPORTS, MATERIALS, ISSUES, INCIDENTS, DIRECTORY],
  [TENANT_ADMIN]: [PROJECTS, REPORTS, INCIDENTS, MATERIALS],
};

/**
 * The two rows every role gets (PO 2026-08-10).
 *
 * Settings is the signed-in user's own account. The Support Center lives at `/support` — a route in
 * the `(auth)` group, which costs nothing here: expo-router groups add no path segment, and that
 * screen carries its own Back control, so it returns the user where they came from. It was reachable
 * only from the login footer before this, which left a signed-in user with no way to ask for help.
 */
export const SHARED_LINKS: readonly DrawerLink[] = [
  { route: '/account-settings', labelKey: 'drawer.settings', icon: 'settings' },
  { route: '/support', labelKey: 'drawer.support', icon: 'support-agent' },
];

/** The routes that are bottom tabs for `role` — a drawer row onto one of them would be a duplicate. */
function visibleTabRoutes(role: CosRole): Set<string> {
  return new Set(visibleTabsFor(role).map((tab) => `/${tab.name}`));
}

/**
 * A tab pushed off the bar, as a drawer row. Same label and glyph, so it is recognisably itself.
 *
 * EXPORTED ONLY SO IT CAN BE TESTED. Every role matches exactly four tabs today, so `drawerLinksFor`
 * never calls it — which leaves the QM-1 gate with an uncovered function and, worse, leaves the rule
 * that catches a fifth tab unexercised until the day it matters. Its own test is the exercise.
 */
export function tabAsDrawerLink(tab: {
  name: string;
  titleKey: string;
  icon: DrawerLink['icon'];
}): DrawerLink {
  return { route: `/${tab.name}`, labelKey: tab.titleKey, icon: tab.icon };
}

/**
 * The role's own drawer section, above the shared rows.
 *
 * Overflow tabs come FIRST: a screen the tab table thought worth a bar slot is that role's primary
 * work, and burying it under the derived list would rank it below screens it outranks.
 *
 * A signed-out or unknown role gets nothing role-specific — the drawer then shows only the two
 * shared rows, which is what a session with no role can honestly offer.
 */
export function drawerLinksFor(role: CosRole | null | undefined): readonly DrawerLink[] {
  if (role == null) return [];
  const drawn = DRAWN[role];
  const base = [
    ...overflowTabsFor(role).map(tabAsDrawerLink),
    ...(drawn ?? [
      ...DERIVED.filter((entry) => entry.roles.includes(role)).map((entry) => entry.link),
      ...(DIRECTORY_ROLES.includes(role) ? [DIRECTORY] : []),
    ]),
  ];
  const tabs = visibleTabRoutes(role);
  // An overflow tab can also appear in the derived list (a role may both have it as a fifth tab and
  // hold the permission behind it); the first occurrence wins so it is not offered twice.
  const seen = new Set<string>();
  return base.filter((link) => {
    if (tabs.has(link.route) || seen.has(link.route)) return false;
    seen.add(link.route);
    return true;
  });
}

/**
 * How many rows the drawer shows before it folds the rest away (PO decision 2026-08-10).
 *
 * Counts the role's own rows only — Settings and the Support Center sit below the divider and are
 * never folded, because "where do I get help" must not itself be two taps deep.
 */
export const DRAWER_MAX_ROWS = 7;

export interface DrawerSection {
  /** Rows drawn directly. */
  visible: readonly DrawerLink[];
  /** Rows behind the "More" row. Empty when the whole list fits. */
  overflow: readonly DrawerLink[];
}

/**
 * The role's section, split at the point where it stops fitting.
 *
 * EXACTLY SEVEN STILL SHOWS SEVEN. Folding at seven-of-seven would replace one row with a "More"
 * that reveals one row — a tap that buys nothing. The split happens only when there is genuinely
 * more than fits, and then row seven becomes "More" and carries everything from seven on, so eight
 * rows render as six + More rather than seven + More.
 *
 * Three roles need it today: EXECUTIVE (17 rows — it may read almost every module), FINANCE (10) and
 * VIEWER (9, whose §6.8 grant is "Procurement (all) R" and "Finance (all) R").
 */
export function drawerSectionFor(role: CosRole | null | undefined): DrawerSection {
  const links = drawerLinksFor(role);
  if (links.length <= DRAWER_MAX_ROWS) return { visible: links, overflow: [] };
  return {
    visible: links.slice(0, DRAWER_MAX_ROWS - 1),
    overflow: links.slice(DRAWER_MAX_ROWS - 1),
  };
}
