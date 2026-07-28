// MobileNav — role-based bottom navigation (spec §32.7 Mobile Core Component Library:
// "MobileNav: Bottom navigation, 4–5 items max, icons + labels").
//
// Implemented on top of Expo Router's <Tabs> navigator: every role's tab set from the
// authoritative spec §Phase 10 is declared once, and tabs outside the current role are
// hidden via `href: null` while keeping the route mountable (reachable by router.push).
//
// Role tab sets (spec §Phase 10):
//   SITE_WORKER:            Home | Tasks | Report | Issues | Profile
//   SITE_ENGINEER:          Home | Issues | Inspections | Reports   (dark tab bar; no Profile — see below)
//   PROJECT_MANAGER:        Home | Projects | Procurement | Dashboard | Profile
//   EXECUTIVE:              Home | Portfolio | Alerts | Reports | Profile
//   FINANCE:                Home | Payments | Budget | Invoices | Profile
//   PROCUREMENT_OFFICER/PROC_MANAGER: Home | RFQs | Orders | Deliveries | Profile
//   SAFETY_OFFICER:         Home | Incidents | Profile (PO ruling D1/D2 — §17.4)
//   TENANT_ADMIN:           Home | Users | Alerts | Settings   (dark tab bar; no Profile tab — reached
//                           via the top-bar avatar. PO decision 2026-07-28, mockup 01_home_admin;
//                           Alerts = sync-review queue, Settings = system-settings.)
//   VIEWER/others:          Home | Profile (minimal access)
//
// SITE_ENGINEER reaches Profile through the avatar in its Home header instead of a fifth tab
// (product-owner decision 2026-07-16 — master §Phase 10 updated to match). The route stays mounted
// via `href: null`, so router.push('/profile') still works.

import { Tabs } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { CosRole } from '@cos/types';
import { useAuthStore } from '../store/authStore';
import { useT } from '../i18n';
import { colors, darkColors } from '../theme/tokens';

/** MaterialIcons glyph name — §32.7 names @expo/vector-icons' MaterialIcons as the icon set. */
type IconName = keyof typeof MaterialIcons.glyphMap;

type TabConfig = {
  name: string;
  titleKey: string;
  /** §32.7 requires "icons + labels" on every bottom-nav item; without one the tab renders blank. */
  icon: IconName;
  roles: CosRole[];
};

// Every role except SITE_ENGINEER (Profile lives in its Home header avatar) and TENANT_ADMIN (whose
// bottom nav is Home|Users|Alerts|Settings — Profile is reached via the top-bar avatar instead).
const PROFILE_TAB_ROLES = Object.values(CosRole).filter(
  (r) => r !== CosRole.SITE_ENGINEER && r !== CosRole.TENANT_ADMIN,
);

// Authoritative per-role tab set (spec §Phase 10). Exported for reuse/testing.
// Icons are MaterialIcons glyph names, type-checked against the set's glyphMap. None of them are
// building / crane / hard-hat / blueprint / gear imagery — §32.7:622 prohibits those.
// Tabs render in array order. SITE_ENGINEER's Home|Issues|Inspections|Reports (product-owner
// decision 2026-07-16) is why `reports` sits after `inspections` rather than before `issues`:
// moving it there does not disturb any other role — SITE_WORKER's issues stays after its report,
// and EXECUTIVE's reports stays ahead of its portfolio.
export const ALL_TABS: TabConfig[] = [
  { name: 'home', titleKey: 'nav.tabs.home', icon: 'home', roles: Object.values(CosRole) },
  // TENANT_ADMIN bottom nav — Home | Users | Alerts | Settings (PO decision 2026-07-28, mockups
  // 04_tenant_admin/00_home,02_users,03_alerts,04_settings). "Alerts" is the sync-review queue
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
  { name: 'tasks', titleKey: 'nav.tabs.tasks', icon: 'checklist', roles: [CosRole.SITE_WORKER] },
  { name: 'report', titleKey: 'nav.tabs.report', icon: 'edit-note', roles: [CosRole.SITE_WORKER] },
  {
    name: 'issues',
    titleKey: 'nav.tabs.issues',
    icon: 'report-problem',
    roles: [CosRole.SITE_WORKER, CosRole.SITE_ENGINEER],
  },
  {
    name: 'inspections',
    titleKey: 'nav.tabs.inspections',
    icon: 'fact-check',
    roles: [CosRole.SITE_ENGINEER],
  },
  {
    name: 'reports',
    titleKey: 'nav.tabs.reports',
    icon: 'description',
    roles: [CosRole.SITE_ENGINEER, CosRole.EXECUTIVE],
  },
  {
    name: 'projects',
    titleKey: 'nav.tabs.projects',
    icon: 'folder',
    roles: [CosRole.PROJECT_MANAGER],
  },
  {
    name: 'procurement',
    titleKey: 'nav.tabs.procurement',
    icon: 'shopping-cart',
    roles: [CosRole.PROJECT_MANAGER],
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
    roles: [CosRole.FINANCE],
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
  { name: 'profile', titleKey: 'nav.tabs.profile', icon: 'person', roles: PROFILE_TAB_ROLES },
];

/** Role-filtered bottom tab navigator. Reads the signed-in role from the auth store. */
export function MobileNav() {
  const role = useAuthStore((s) => s.role) as CosRole | null;
  const t = useT();

  // Dark-shell roles' landing is a dark dashboard (§32.7 Mobile Dark Surfaces), so their whole tab bar
  // is dark for a consistent shell — SITE_ENGINEER (PO decision 2026-07-16) + TENANT_ADMIN (PO decision
  // 2026-07-28). Every other role keeps the light field-app tab bar. A light tab bar under a dark Home
  // is the mismatch this fixes.
  const dark = role === CosRole.SITE_ENGINEER || role === CosRole.TENANT_ADMIN;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Active tab: a filled rounded rectangle behind icon+label, per the mockup's
        // bg-primary-container (product-owner decision 2026-07-16, all roles). The active tint is
        // light so it reads on the blue highlight; inactive stays muted. Only borderRadius + a
        // horizontal inset — no vertical margin or overflow:hidden, which clip the label away and
        // break §32.7's "icons + labels".
        tabBarActiveTintColor: darkColors.text,
        tabBarInactiveTintColor: dark ? darkColors.muted : colors.textSecondary,
        tabBarActiveBackgroundColor: colors.primary,
        tabBarItemStyle: { borderRadius: 20, marginHorizontal: 4 },
        tabBarStyle: dark
          ? { backgroundColor: darkColors.surface, borderTopColor: darkColors.border }
          : undefined,
      }}
    >
      {ALL_TABS.map((tab) => {
        const visible = role != null && tab.roles.includes(role);
        return (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: t(tab.titleKey),
              // href: null hides the tab from the tab bar while keeping the route mountable.
              href: visible ? undefined : null,
              // §32.7 "icons + labels". `color` comes from the active/inactive tints above, so the
              // glyph follows the label rather than being painted a fixed colour.
              tabBarIcon: ({ color, size }) => (
                <MaterialIcons name={tab.icon} size={size} color={color} />
              ),
              // E2E navigation hook. The inspection suite taps by.id('inspection-tab').
              // React Navigation 7 (expo-router 56) renamed tabBarTestID → tabBarButtonTestID.
              tabBarButtonTestID: tab.name === 'inspections' ? 'inspection-tab' : `${tab.name}-tab`,
            }}
          />
        );
      })}
      {/* Routes reached via router.push (ConflictBadge / quick actions / drawer), never bottom tabs.
          `notifications` + `notification-preferences` are intentionally NOT here — they are declared in
          ALL_TABS above (bottom tabs for TENANT_ADMIN, href:null for every other role). Without an
          explicit href:null expo-router auto-registers each remaining (app)/ route file as a visible
          tab (the leak that once put mfa-enrollment / notification-preferences on every bottom bar). */}
      <Tabs.Screen name="conflict-review" options={{ href: null }} />
      {/* Notification inbox — reached from the top-bar bell (router.push). No role lists it as a tab. */}
      <Tabs.Screen name="notifications" options={{ href: null }} />
      {/* Notification preferences — reached from the Settings screen / notifications inbox (router.push).
          It was briefly the TENANT_ADMIN "Settings" tab; that tab is now `system-settings`. */}
      <Tabs.Screen name="notification-preferences" options={{ href: null }} />
      {/* Invite user — reached from the Quick Commands overlay (router.push), never a bottom tab. */}
      <Tabs.Screen name="invite-user" options={{ href: null }} />
      {/* Role permissions — reached from Invite-user's "View permissions" (router.push). */}
      <Tabs.Screen name="role-permissions" options={{ href: null }} />
      <Tabs.Screen name="material-request" options={{ href: null }} />
      <Tabs.Screen name="mfa-enrollment" options={{ href: null }} />
    </Tabs>
  );
}
