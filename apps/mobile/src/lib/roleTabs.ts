// The per-role bottom-tab table (spec §Phase 10, §32.7 "MobileNav: exactly 4 items").
//
// WHY IT LIVES HERE AND NOT IN MobileNav. This is DATA — which routes each role sees, in which order —
// and two things now read it: the navigator, and `landingRoute.ts` (where a signed-in user is sent).
// Keeping it inside the component made it unreachable from a unit test: importing MobileNav drags in
// expo-router, which is ESM and dies under this CommonJS jest setup ("Cannot use import statement
// outside a module"). That is the same constraint that forces routeRegistry.spec.ts to read source
// files as text instead of importing them.
//
// This module imports NOTHING at runtime except @cos/types — the MaterialIcons reference is a
// `import type`, erased at compile time — so it stays importable from anywhere, tests included.

import type { MaterialIcons } from '@expo/vector-icons';
import { CosRole } from '@cos/types';

/** MaterialIcons glyph name — §32.7 names @expo/vector-icons' MaterialIcons as the icon set. */
export type IconName = keyof typeof MaterialIcons.glyphMap;

export type TabConfig = {
  name: string;
  titleKey: string;
  /** §32.7 requires "icons + labels" on every bottom-nav item; without one the tab renders blank. */
  icon: IconName;
  roles: CosRole[];
};

// Authoritative per-role tab set (spec §Phase 10).
// Icons are MaterialIcons glyph names, type-checked against the set's glyphMap. None of them are
// building / crane / hard-hat / blueprint / gear imagery — §32.7:622 prohibits those.
// Tabs render in array order, and the FIRST entry a role matches is also where it lands after sign-in
// (lib/landingRoute.ts), so order is behaviour, not presentation.
export const ALL_TABS: TabConfig[] = [
  // EVERY role, SITE_WORKER included (PO decision 2026-08-08, reversing the same day's earlier
  // "follow the mockups exactly" ruling). The mockups give the Site Worker four working tabs and no
  // landing page, but Home is the first tab for all eleven other roles, and a bar that starts
  // somewhere different for one role is a worse cost than the deviation from those four drawings.
  // Its task list did NOT disappear: `tasks` is now a pushed child of Home, reached from the Tasks
  // quick action that FieldHome already carried.
  { name: 'home', titleKey: 'nav.tabs.home', icon: 'home', roles: Object.values(CosRole) },
  // TENANT_ADMIN bottom nav — Home | Users | Alerts | Settings (PO decision 2026-07-28, mockups
  // 04_tenant_admin/01_home,02_users,03_alerts,04_settings). "Alerts" is the sync-review queue
  // (04_tenant_admin/03_alerts — conflict records) and "Settings" is the system-settings route
  // (both dark, §32.7). For every other role these three stay href:null — mountable but never a tab.
  { name: 'users', titleKey: 'nav.tabs.users', icon: 'group', roles: [CosRole.TENANT_ADMIN] },
  {
    name: 'sync-queue',
    titleKey: 'nav.tabs.alerts',
    icon: 'notification-important',
    roles: [CosRole.TENANT_ADMIN],
  },
  {
    name: 'system-settings',
    titleKey: 'nav.tabs.settings',
    icon: 'settings',
    roles: [CosRole.TENANT_ADMIN],
  },
  // SITE_WORKER's bar is Home | Tasks | Safety | Directory (PO decision 2026-08-09), which is the
  // 01_home/01_dashboard mockup's bar with Home in the Projects slot — a field worker has no
  // project-portfolio screen, and Home stays first for all twelve roles.
  //
  // `tasks` is a tab AGAIN. It lost the slot on 2026-08-08 when Home took it and became a pushed
  // child of Home; Issues and Reports have now given up their slots instead, and both are reached
  // from the Home FAB's quick-action menu (mockup 01_home/02_quick_actions), which carries exactly
  // those two plus Safety. So no screen lost its entry point in the swap.
  { name: 'tasks', titleKey: 'nav.tabs.tasks', icon: 'assignment', roles: [CosRole.SITE_WORKER] },
  // `issues` is no longer a SITE_WORKER tab — it stays SITE_ENGINEER's, whose own bar is unchanged
  // (Home | Issues | Inspections | Reports).
  {
    name: 'issues',
    titleKey: 'nav.tabs.issues',
    icon: 'report-problem',
    roles: [CosRole.SITE_ENGINEER],
  },
  // `report` (the singular daily-entry FORM) is now a tab for NO role. It is declared `href: null`
  // in MobileNav and pushed from the quick-action menu, like any other child screen. The
  // SITE_ENGINEER `reports` tab below is a different route — the review list that shares the word.
  {
    name: 'safety-checklist',
    titleKey: 'nav.tabs.safety',
    icon: 'health-and-safety',
    roles: [CosRole.SITE_WORKER],
  },
  // Team directory — a tab for SITE_WORKER only (PO 2026-08-09). Every other role that can read it
  // still reaches it from the navigation drawer, which is why NavigationDrawer keeps its link for
  // them and drops it for this role.
  {
    name: 'directory',
    titleKey: 'nav.tabs.directory',
    icon: 'groups',
    roles: [CosRole.SITE_WORKER],
  },
  {
    name: 'inspections',
    titleKey: 'nav.tabs.inspections',
    icon: 'fact-check',
    roles: [CosRole.SITE_ENGINEER, CosRole.SAFETY_OFFICER],
  },
  {
    name: 'reports',
    titleKey: 'nav.tabs.reports',
    icon: 'description',
    roles: [CosRole.SITE_ENGINEER, CosRole.EXECUTIVE, CosRole.SAFETY_OFFICER],
  },
  {
    name: 'projects',
    titleKey: 'nav.tabs.projects',
    icon: 'folder',
    roles: [CosRole.PROJECT_MANAGER, CosRole.VIEWER],
  },
  {
    name: 'procurement',
    titleKey: 'nav.tabs.procurement',
    icon: 'shopping-cart',
    roles: [CosRole.PROJECT_MANAGER, CosRole.VIEWER],
  },
  {
    name: 'dashboard',
    titleKey: 'nav.tabs.dashboard',
    icon: 'insights',
    roles: [CosRole.PROJECT_MANAGER],
  },
  {
    name: 'portfolio',
    titleKey: 'nav.tabs.portfolio',
    icon: 'pie-chart',
    roles: [CosRole.EXECUTIVE],
  },
  {
    name: 'alerts',
    titleKey: 'nav.tabs.alerts',
    icon: 'notification-important',
    roles: [CosRole.EXECUTIVE],
  },
  { name: 'payments', titleKey: 'nav.tabs.payments', icon: 'payments', roles: [CosRole.FINANCE] },
  {
    name: 'budget',
    titleKey: 'nav.tabs.budget',
    icon: 'account-balance-wallet',
    roles: [CosRole.FINANCE, CosRole.VIEWER],
  },
  {
    name: 'invoices',
    titleKey: 'nav.tabs.invoices',
    icon: 'receipt-long',
    roles: [CosRole.FINANCE],
  },
  {
    name: 'rfqs',
    titleKey: 'nav.tabs.rfqs',
    icon: 'request-quote',
    roles: [CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER],
  },
  {
    name: 'orders',
    titleKey: 'nav.tabs.orders',
    icon: 'inventory-2',
    roles: [CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER],
  },
  {
    name: 'deliveries',
    titleKey: 'nav.tabs.deliveries',
    icon: 'local-shipping',
    roles: [CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER],
  },
  {
    name: 'incidents',
    titleKey: 'nav.tabs.incidents',
    icon: 'health-and-safety',
    roles: [CosRole.SAFETY_OFFICER],
  },
  // CRM — the three pages §20.7.10 defines for CRM_SALES_MANAGER, in lifecycle order
  // (lead → opportunity → customer), which is also the order the work happens in.
  {
    name: 'leads',
    titleKey: 'nav.tabs.leads',
    icon: 'person-add',
    roles: [CosRole.CRM_SALES_MANAGER],
  },
  {
    name: 'opportunities',
    titleKey: 'nav.tabs.opportunities',
    icon: 'trending-up',
    roles: [CosRole.CRM_SALES_MANAGER],
  },
  {
    name: 'customers',
    titleKey: 'nav.tabs.customers',
    icon: 'business',
    roles: [CosRole.CRM_SALES_MANAGER],
  },
];
