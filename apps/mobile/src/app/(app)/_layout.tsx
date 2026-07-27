// Authenticated app shell — Priority 0 Section F (spec §Phase 10).
// Renders the persistent offline/sync banners and the role-based bottom navigation
// (<MobileNav /> — spec §32.7). The tab set per role lives in components/MobileNav.

import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { usePathname } from 'expo-router';
import { CosRole } from '@cos/types';
import { runDeltaSync } from '../../sync/runDeltaSync';
import { runPushSync } from '../../sync/runPushSync';
import { checkLocalDbLimit } from '../../db/database';
import { OfflineBanner } from '../../components/OfflineBanner';
import { SyncStatusBar } from '../../components/SyncStatusBar';
import { TopBar } from '../../components/TopBar';
import { MobileNav } from '../../components/MobileNav';
import { NavigationDrawer } from '../../components/NavigationDrawer';
import { useAuthStore } from '../../store/authStore';
import { setLastAppPath } from '../../lib/e2e/lastRoute';

export default function AppLayout() {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.role);

  // Remember the current in-app route so the E2E network-toggle deep link can return here (see
  // lib/e2e/lastRoute). No-op effect in production beyond bookkeeping.
  useEffect(() => {
    setLastAppPath(pathname);
  }, [pathname]);

  // On entering the app: flush the outbound mutation queue + photo uploads (push), then pull the
  // server-side delta into the local DB. Both are best-effort — offline or transient failures leave
  // local state untouched and are retried on the next entry. After the pull grows the cache, check
  // it against the §17.7 500 MB ceiling (warns on WARN/FULL).
  useEffect(() => {
    runPushSync()
      .catch(() => {
        /* offline or transient — queued mutations stay pending, retried next entry */
      })
      .then(() => runDeltaSync())
      .catch(() => {
        /* offline or transient — local cache stays as-is */
      })
      .finally(() => {
        checkLocalDbLimit();
      });
  }, []);

  // Dark-shell roles (§32.7 Mobile Dark Surfaces): their signed-in Home is a dark dashboard, so the
  // whole shell — top bar + bottom nav — renders dark to match the content (a light shell over dark
  // content is the mismatch this fixes). SITE_ENGINEER + TENANT_ADMIN (PO decision 2026-07-28 adds
  // the Tenant Admin Home to the §32.7 dark list). Every other role keeps the light field palette.
  const darkShell = role === CosRole.SITE_ENGINEER || role === CosRole.TENANT_ADMIN;
  const variant = darkShell ? 'dark' : 'light';

  return (
    <View style={styles.root}>
      {/* Standard top bar (§32.7) owns the safe-area top inset and gives the header its surface
          background. Then the offline/sync banners, then the tab content. */}
      <TopBar variant={variant} />
      <OfflineBanner />
      {/* The dark-shell dashboards (SITE_ENGINEER, TENANT_ADMIN) match their mockups, which have no
          persistent light sync strip (PO decision 2026-07-25 "full parity", extended 2026-07-28); the
          bar stays for every other role — including its E2E assertions (all field-role flows).
          OfflineBanner is kept for all roles (it only appears while offline). */}
      {darkShell ? null : <SyncStatusBar />}
      <View style={styles.tabs}>
        <MobileNav />
      </View>
      {/* Side drawer (mockup 04) — overlays the tabs, opened from the TopBar hamburger. Renders null
          while closed, so it never intercepts touches until opened. */}
      <NavigationDrawer />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabs: { flex: 1 },
});
