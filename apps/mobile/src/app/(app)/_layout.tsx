// Authenticated app shell — Priority 0 Section F (spec §Phase 10).
// Renders the persistent offline/sync banners and the role-based bottom navigation
// (<MobileNav /> — spec §32.7). The tab set per role lives in components/MobileNav.

import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { usePathname } from 'expo-router';
import { runDeltaSync } from '../../sync/runDeltaSync';
import { runPushSync } from '../../sync/runPushSync';
import { checkLocalDbLimit } from '../../db/database';
import { OfflineBanner } from '../../components/OfflineBanner';
import { TopBar } from '../../components/TopBar';
import { Breadcrumb } from '../../components/Breadcrumb';
import { MobileNav } from '../../components/MobileNav';
import { NavigationDrawer } from '../../components/NavigationDrawer';
import { useIsDark } from '../../theme/usePalette';
import { setLastAppPath } from '../../lib/e2e/lastRoute';

export default function AppLayout() {
  const pathname = usePathname();

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

  // Shell colour follows the USER'S theme, not the role (PO decision 2026-08-04: dark is the product
  // default for every role, light is selectable in Profile). This replaces the previous rule where
  // only SITE_ENGINEER and TENANT_ADMIN got a dark shell because their Home mockups were dark.
  //
  // Nothing in this shell branches on the role any more: with the sync strip replaced by the top-bar
  // pill (below), every role gets the same chrome and only the tab SET differs (components/MobileNav).
  const dark = useIsDark();
  const variant = dark ? 'dark' : 'light';

  return (
    <View style={styles.root}>
      {/* Standard top bar (§32.7) owns the safe-area top inset and gives the header its surface
          background. Then the offline/sync banners, then the tab content. */}
      <TopBar variant={variant} />
      {/* Clickable breadcrumb for pushed child screens (null on main tabs / terminal screens). */}
      <Breadcrumb variant={variant} />
      {/* OfflineBanner is kept for all roles — it only appears while actually offline.
          The full-width green <SyncStatusBar /> strip that used to sit here is GONE (PO decision
          2026-08-04): the compact <SyncPill /> in the top bar is now the standard sync indicator for
          every role, as 01_home_dashboard draws it. It was previously dropped only for the two
          dark-shell dashboards; making the pill universal removes the last piece of chrome whose
          presence depended on which role was signed in. */}
      <OfflineBanner />
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
