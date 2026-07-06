// Role-based tab navigator — Priority 0 Section F (spec §Phase 10)
// Each role sees exactly the tabs specified in the authoritative spec.
// Tabs not in the current role are hidden via href: null.
//
// Role tab sets (spec §Phase 10):
//   SITE_WORKER:            Home | Tasks | Report | Issues | Profile
//   SITE_ENGINEER:          Home | Reports | Issues | Inspections | Profile
//   PROJECT_MANAGER:        Home | Projects | Procurement | Dashboard | Profile
//   EXECUTIVE:              Home | Portfolio | Alerts | Reports | Profile
//   FINANCE:                Home | Payments | Budget | Invoices | Profile
//   PROCUREMENT_OFFICER/PROC_MANAGER: Home | RFQs | Orders | Deliveries | Profile
//   SAFETY_OFFICER:         Home | Incidents | Profile (PO ruling D1/D2 — §17.4 offline incident capability)
//   TENANT_ADMIN/VIEWER/others: Home | Profile (minimal access)

import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs, usePathname } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { CosRole } from '@cos/types';
import { runDeltaSync } from '../../sync/runDeltaSync';
import { checkLocalDbLimit } from '../../db/database';
import { OfflineBanner } from '../../components/OfflineBanner';
import { SyncStatusBar } from '../../components/SyncStatusBar';
import { useT } from '../../i18n';
import { setLastAppPath } from '../../lib/e2e/lastRoute';

type TabConfig = {
  name: string;
  titleKey: string;
  roles: CosRole[];
};

const ALL_TABS: TabConfig[] = [
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

export default function AppLayout() {
  const role = useAuthStore((s) => s.role) as CosRole | null;
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const t = useT();

  // Remember the current in-app route so the E2E network-toggle deep link can return here (see
  // lib/e2e/lastRoute). No-op effect in production beyond bookkeeping.
  useEffect(() => {
    setLastAppPath(pathname);
  }, [pathname]);

  // Pull server-side delta into the local DB on entering the app (best-effort; offline ignored).
  // After the pull grows the cache, check it against the §17.7 500 MB ceiling (warns on WARN/FULL).
  useEffect(() => {
    runDeltaSync()
      .catch(() => {
        /* offline or transient — local cache stays as-is */
      })
      .finally(() => {
        checkLocalDbLimit();
      });
  }, []);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Network + sync state, shown above the tab content on every authenticated screen. The top
          inset keeps the banners clear of the status bar / notch so they are visible to Detox. */}
      <OfflineBanner />
      <SyncStatusBar />
      <View style={styles.tabs}>
        <Tabs screenOptions={{ headerShown: false }}>
          {ALL_TABS.map((tab) => {
            const visible = role != null && tab.roles.includes(role);
            return (
              <Tabs.Screen
                key={tab.name}
                name={tab.name}
                options={{
                  title: t(tab.titleKey),
                  // href: null hides the tab from the tab bar while keeping the route mountable
                  href: visible ? undefined : null,
                  // E2E navigation hook. The inspection suite taps by.id('inspection-tab').
                  // React Navigation 7 (expo-router 56) renamed tabBarTestID → tabBarButtonTestID.
                  tabBarButtonTestID:
                    tab.name === 'inspections' ? 'inspection-tab' : `${tab.name}-tab`,
                }}
              />
            );
          })}
          {/* Reachable via ConflictBadge (router.push), never shown as a bottom tab. */}
          <Tabs.Screen name="conflict-review" options={{ href: null }} />
        </Tabs>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabs: { flex: 1 },
});
