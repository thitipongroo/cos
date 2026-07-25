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

  // The Site Engineer's shell is dark (§32.7 Mobile Dark Surfaces); every other role is light.
  const isSiteEngineer = role === CosRole.SITE_ENGINEER;
  const variant = isSiteEngineer ? 'dark' : 'light';

  return (
    <View style={styles.root}>
      {/* Standard top bar (§32.7) owns the safe-area top inset and gives the header its surface
          background. Then the offline/sync banners, then the tab content. */}
      <TopBar variant={variant} />
      <OfflineBanner />
      {/* The SITE_ENGINEER dashboard matches its mockup, which has no persistent sync strip (PO
          decision 2026-07-25, "full parity"); the bar stays for every other role — including its
          E2E assertions. OfflineBanner is kept for all roles (it only appears while offline). */}
      {isSiteEngineer ? null : <SyncStatusBar />}
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
