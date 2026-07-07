// Authenticated app shell — Priority 0 Section F (spec §Phase 10).
// Renders the persistent offline/sync banners and the role-based bottom navigation
// (<MobileNav /> — spec §32.7). The tab set per role lives in components/MobileNav.

import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';
import { runDeltaSync } from '../../sync/runDeltaSync';
import { checkLocalDbLimit } from '../../db/database';
import { OfflineBanner } from '../../components/OfflineBanner';
import { SyncStatusBar } from '../../components/SyncStatusBar';
import { MobileNav } from '../../components/MobileNav';
import { setLastAppPath } from '../../lib/e2e/lastRoute';

export default function AppLayout() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();

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
        <MobileNav />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabs: { flex: 1 },
});
