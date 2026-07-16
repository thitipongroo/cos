// Authenticated app shell — Priority 0 Section F (spec §Phase 10).
// Renders the persistent offline/sync banners and the role-based bottom navigation
// (<MobileNav /> — spec §32.7). The tab set per role lives in components/MobileNav.

import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { usePathname } from 'expo-router';
import { CosRole } from '@cos/types';
import { runDeltaSync } from '../../sync/runDeltaSync';
import { checkLocalDbLimit } from '../../db/database';
import { OfflineBanner } from '../../components/OfflineBanner';
import { SyncStatusBar } from '../../components/SyncStatusBar';
import { TopBar } from '../../components/TopBar';
import { MobileNav } from '../../components/MobileNav';
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

  // The Site Engineer's shell is dark (§32.7 Mobile Dark Surfaces); every other role is light.
  const variant = role === CosRole.SITE_ENGINEER ? 'dark' : 'light';

  return (
    <View style={styles.root}>
      {/* Standard top bar (§32.7) owns the safe-area top inset and gives the header its surface
          background. Then the offline/sync banners, then the tab content. */}
      <TopBar variant={variant} />
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
