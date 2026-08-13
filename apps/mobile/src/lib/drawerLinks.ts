// What each role sees in the navigation drawer.
//
// EVERY ROLE OPENS ON THE SAME FOUR ROWS, THEN ITS OWN — product-owner decision 2026-08-14. The
// drawer drawing was copied to `mockup/mobile/02_shared/01_navigation_drawer`, byte-identical to
// `04_tenant_admin/05_navigation_drawer`, which is what settled it: a drawing filed under `02_shared/`
// is nobody's role menu. So the drawn rows lead every role's drawer and the role's own rows follow.
//
// This REPLACES the 2026-08-10 arrangement, where exactly two roles (TENANT_ADMIN, PROJECT_MANAGER)
// took their drawing verbatim and the other ten derived their list. What that decision was actually
// protecting is kept, not discarded: it existed because the drawer once handed the TENANT_ADMIN menu
// to all twelve roles, so a Site Worker was offered the administrator's screens. The four shared rows
// below are gated by §6.4 exactly like the derived ones, so a role still sees only what it may open.
//
// WHERE EACH ROLE'S LIST COMES FROM:
//
//   - THE FOUR DRAWN ROWS FIRST — Project Overview · Daily Site Reports · Safety Incident Logs ·
//     Material Inventory. They are not a separate table: they are the first four entries of `DERIVED`,
//     so each still appears only where §6.4 grants the module behind it. A role holding `—` on Safety
//     incidents does not get that row, and no drawn row can lead to a 403.
//     The drawing's other two rows are NOT here: Equipment Logs and Drawing Viewer have no route in
//     this app, and inventing one would put a drawing's authority behind a guess.
//   - THE ROLE'S OWN ROWS BELOW — DERIVED from spec §6.4's module permission matrix (and §6.8 for the
//     three sub-roles): a row appears if that role's cell is anything other than `—`. So the drawer
//     offers a role exactly the screens it may actually open.
//
// NOTHING LOST ITS LAST ENTRY POINT IN THE SWAP. Dropping the two verbatim drawings would have
// orphaned five routes that §6.4 governs no module for, and `drawerSectionFor` folds the longer lists
// at DRAWER_MAX_ROWS rather than truncating them, so no role pays for the four leading rows with a
// screen it can no longer reach. `NOT_DERIVED_ROLES` below carries the five.
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
    link: INCIDENTS,
    module: 'Safety incidents',
    roles: [EXECUTIVE, PROJECT_MANAGER, SITE_ENGINEER, SAFETY_OFFICER, TENANT_ADMIN, SITE_WORKER],
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
  // ── end of the four drawn rows; everything below is the role's own ──────────────────────────────
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
    link: INSPECTIONS,
    module: 'Inspections / QC',
    roles: [EXECUTIVE, PROJECT_MANAGER, SITE_ENGINEER, SAFETY_OFFICER, TENANT_ADMIN],
  },
  {
    link: SAFETY_CHECKLIST,
    module: 'Safety checklists',
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
 * Rows §6.4 governs no module for, and the roles that get them anyway.
 *
 * These cannot be derived: no row in the matrix names them, and attaching one to a row it does not
 * read would put the spec's authority behind a guess. They are therefore listed, with the reason each
 * role is on the list.
 *
 * `/directory` — a crew contact list. "Workforce attendance" is who turned up, not who to call.
 *   SITE_ENGINEER and SAFETY_OFFICER carried it before; PROJECT_MANAGER joins them because its own
 *   drawing drew it, and dropping that drawing must not cost the role a screen (see below).
 * `/dashboard` and `/issues` — PROJECT_MANAGER only, and for the same reason: both were rows in
 *   `06_project_manager/05_navigation_drawer`, and neither is a PM tab (its bar is Home · Procurement
 *   · Finance · More), so removing the verbatim drawings would have left them unreachable for the one
 *   role that had them. SITE_ENGINEER reaches `/issues` as a TAB, so it is not listed here.
 */
const NOT_DERIVED: readonly { link: DrawerLink; roles: readonly CosRole[] }[] = [
  { link: DASHBOARD, roles: [PROJECT_MANAGER] },
  { link: ISSUES, roles: [PROJECT_MANAGER] },
  { link: DIRECTORY, roles: [SITE_ENGINEER, SAFETY_OFFICER, PROJECT_MANAGER] },
];

/**
 * WHAT THE TWO VERBATIM DRAWINGS SAID, AND WHERE EACH ROW WENT (kept as the record of the 2026-08-14
 * change — the rows did not disappear, they moved into the two tables above).
 *
 * PROJECT_MANAGER — mockup 06_project_manager/05_navigation_drawer:
 *   Project Dashboard  → `/dashboard`         → NOT_DERIVED (PM only)
 *   Daily Site Reports → `/reports`           → DERIVED "Site reports" — now a drawn row
 *   Material Inventory → `/material-request`  → DERIVED "Purchase requests" — now a drawn row
 *   Issue Management   → `/issues`            → NOT_DERIVED (PM only)
 *   Safety Compliance  → `/incidents`         → DERIVED "Safety incidents" — now a drawn row.
 *                                       The safety-event REGISTER, not `/safety-checklist`: the
 *                                       checklist is the worker's daily form, an action; a manager
 *                                       opening "compliance" is reviewing what happened.
 *   System Settings    → in SHARED_LINKS
 *   BIM Progress Audit → NOTHING. `00-glossary.md`: "Full BIM integration is post-MVP".
 *   `/projects` was added although the drawing does not name it: this role's Projects TAB was given up
 *   on 2026-08-10 for Finance and More, and a screen must not lose its last entry point in a swap.
 *   It is now a drawn row (DERIVED "Project (view)"), so the role keeps it either way.
 *
 * TENANT_ADMIN — mockup 04_tenant_admin/05_navigation_drawer, the drawing since copied to
 *   `02_shared/01_navigation_drawer`: Project Overview · Daily Site Reports · Safety Incident Logs ·
 *   Material Inventory · Settings. Equipment Logs and Drawing Viewer were omitted then and still are
 *   — neither has a route in this app. Those four rows ARE the shared block now, which is the whole
 *   point of the 2026-08-14 decision: they were never Tenant-Admin-specific.
 *   ONE BEHAVIOUR CHANGED HERE. This role's drawer used to stop at its drawing even though it holds
 *   FULL almost everywhere; it now also derives, so rows such as `/payments` appear for it. That is
 *   the intended consequence of the drawing no longer being its own — a narrowing that only ever
 *   applied because the drawing was filed under this role cannot survive the drawing moving out.
 */

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
  const base = [
    ...overflowTabsFor(role).map(tabAsDrawerLink),
    ...DERIVED.filter((entry) => entry.roles.includes(role)).map((entry) => entry.link),
    ...NOT_DERIVED.filter((entry) => entry.roles.includes(role)).map((entry) => entry.link),
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
 * Six roles need it today: PROJECT_MANAGER and TENANT_ADMIN (19 rows each), EXECUTIVE (18 — it may
 * read almost every module), FINANCE (10), VIEWER (9, whose §6.8 grant is "Procurement (all) R" and
 * "Finance (all) R") and SITE_ENGINEER (8). PROCUREMENT_OFFICER sits on exactly seven and so shows
 * all seven. The counts moved on 2026-08-14, when TENANT_ADMIN and PROJECT_MANAGER stopped taking
 * their drawing verbatim and began deriving as well; the previous note read 17/10/9 and was already
 * one row stale on EXECUTIVE, which gained /permits on 2026-08-13.
 */
export function drawerSectionFor(role: CosRole | null | undefined): DrawerSection {
  const links = drawerLinksFor(role);
  if (links.length <= DRAWER_MAX_ROWS) return { visible: links, overflow: [] };
  return {
    visible: links.slice(0, DRAWER_MAX_ROWS - 1),
    overflow: links.slice(DRAWER_MAX_ROWS - 1),
  };
}
