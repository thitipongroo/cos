// MobileNav — role-based bottom navigation (spec §32.7 Mobile Core Component Library:
// "MobileNav: Bottom navigation, 4–5 items max, icons + labels").
//
// Implemented on top of Expo Router's <Tabs> navigator: every role's tab set from the
// authoritative spec §Phase 10 is declared once, and tabs outside the current role are
// hidden via `href: null` while keeping the route mountable (reachable by router.push).
//
// Role tab sets (spec §Phase 10):
//   SITE_WORKER:            Home | Tasks | Report | Issues | Profile
//   SITE_ENGINEER:          Home | Reports | Issues | Inspections | Profile
//   PROJECT_MANAGER:        Home | Projects | Procurement | Dashboard | Profile
//   EXECUTIVE:              Home | Portfolio | Alerts | Reports | Profile
//   FINANCE:                Home | Payments | Budget | Invoices | Profile
//   PROCUREMENT_OFFICER/PROC_MANAGER: Home | RFQs | Orders | Deliveries | Profile
//   SAFETY_OFFICER:         Home | Incidents | Profile (PO ruling D1/D2 — §17.4)
//   TENANT_ADMIN/VIEWER/others: Home | Profile (minimal access)

import { Tabs } from 'expo-router';
import { CosRole } from '@cos/types';
import { useAuthStore } from '../store/authStore';
import { useT } from '../i18n';

type TabConfig = {
  name: string;
  titleKey: string;
  roles: CosRole[];
};

// Authoritative per-role tab set (spec §Phase 10). Exported for reuse/testing.
export const ALL_TABS: TabConfig[] = [
  { name: 'home', titleKey: 'nav.tabs.home', roles: Object.values(CosRole) },
  { name: 'tasks', titleKey: 'nav.tabs.tasks', roles: [CosRole.SITE_WORKER] },
  { name: 'report', titleKey: 'nav.tabs.report', roles: [CosRole.SITE_WORKER] },
  {
    name: 'reports',
    titleKey: 'nav.tabs.reports',
    roles: [CosRole.SITE_ENGINEER, CosRole.EXECUTIVE],
  },
  {
    name: 'issues',
    titleKey: 'nav.tabs.issues',
    roles: [CosRole.SITE_WORKER, CosRole.SITE_ENGINEER],
  },
  { name: 'inspections', titleKey: 'nav.tabs.inspections', roles: [CosRole.SITE_ENGINEER] },
  { name: 'projects', titleKey: 'nav.tabs.projects', roles: [CosRole.PROJECT_MANAGER] },
  { name: 'procurement', titleKey: 'nav.tabs.procurement', roles: [CosRole.PROJECT_MANAGER] },
  { name: 'dashboard', titleKey: 'nav.tabs.dashboard', roles: [CosRole.PROJECT_MANAGER] },
  { name: 'portfolio', titleKey: 'nav.tabs.portfolio', roles: [CosRole.EXECUTIVE] },
  { name: 'alerts', titleKey: 'nav.tabs.alerts', roles: [CosRole.EXECUTIVE] },
  { name: 'payments', titleKey: 'nav.tabs.payments', roles: [CosRole.FINANCE] },
  { name: 'budget', titleKey: 'nav.tabs.budget', roles: [CosRole.FINANCE] },
  { name: 'invoices', titleKey: 'nav.tabs.invoices', roles: [CosRole.FINANCE] },
  {
    name: 'rfqs',
    titleKey: 'nav.tabs.rfqs',
    roles: [CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER],
  },
  {
    name: 'orders',
    titleKey: 'nav.tabs.orders',
    roles: [CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER],
  },
  {
    name: 'deliveries',
    titleKey: 'nav.tabs.deliveries',
    roles: [CosRole.PROCUREMENT_OFFICER, CosRole.PROC_MANAGER],
  },
  { name: 'incidents', titleKey: 'nav.tabs.incidents', roles: [CosRole.SAFETY_OFFICER] },
  { name: 'profile', titleKey: 'nav.tabs.profile', roles: Object.values(CosRole) },
];

/** Role-filtered bottom tab navigator. Reads the signed-in role from the auth store. */
export function MobileNav() {
  const role = useAuthStore((s) => s.role) as CosRole | null;
  const t = useT();

  return (
    <Tabs screenOptions={{ headerShown: false }}>
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
              // E2E navigation hook. The inspection suite taps by.id('inspection-tab').
              // React Navigation 7 (expo-router 56) renamed tabBarTestID → tabBarButtonTestID.
              tabBarButtonTestID: tab.name === 'inspections' ? 'inspection-tab' : `${tab.name}-tab`,
            }}
          />
        );
      })}
      {/* Reachable via ConflictBadge (router.push), never shown as a bottom tab. */}
      <Tabs.Screen name="conflict-review" options={{ href: null }} />
    </Tabs>
  );
}
