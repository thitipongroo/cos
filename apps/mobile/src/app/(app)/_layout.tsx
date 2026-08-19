// Authenticated app shell — Priority 0 Section F (spec §Phase 10).
// Renders the persistent offline/sync banners and the role-based bottom navigation
// (<MobileNav /> — spec §32.7). The tab set per role lives in components/MobileNav.

import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { usePathname } from 'expo-router';
import { SelectProjectSheet } from '../../components/SelectProjectSheet';
import { CosRole } from '@cos/types';
import { runSyncCycle } from '../../sync/syncRunner';
import { checkLocalDbLimit } from '../../db/database';
import { TopBar } from '../../components/TopBar';
import { Breadcrumb } from '../../components/Breadcrumb';
import { MobileNav } from '../../components/MobileNav';
import { NavigationDrawer } from '../../components/NavigationDrawer';
import { useIsDark } from '../../theme/usePalette';
import { setLastAppPath } from '../../lib/e2e/lastRoute';
import { useAuthStore } from '../../store/authStore';
import { useProjectStore } from '../../store/projectStore';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useOfflineStore } from '../../store/offlineStore';

export default function AppLayout() {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.role);
  const hydrateProject = useProjectStore((s) => s.hydrate);
  const { isOnline } = useNetworkStatus();

  // The remembered site, read back once per launch. Until it has been read, `active` is null and the
  // guard below must not fire — otherwise every cold start would bounce a worker who had already
  // chosen, into the picker.
  useEffect(() => {
    void hydrateProject();
  }, [hydrateProject]);

  // Remember the current in-app route so the E2E network-toggle deep link can return here (see
  // lib/e2e/lastRoute). No-op effect in production beyond bookkeeping.
  useEffect(() => {
    setLastAppPath(pathname);
  }, [pathname]);

  // On entering the app: flush the outbound mutation queue + photo uploads (push), then pull the
  // server-side delta into the local DB. Both are best-effort — offline or transient failures leave
  // local state untouched and are retried on the next entry. After the pull grows the cache, check
  // it against the §17.7 500 MB ceiling (warns on WARN/FULL).
  //
  // AND AGAIN THE MOMENT THE SIGNAL COMES BACK. `isOnline` in the dependency list is the whole point:
  // the effect used to run once, on `[]`, so a worker who spent a morning filling in reports with no
  // coverage had to leave the app group and come back before any of it was sent. `useNetworkStatus`
  // already knew when connectivity returned; nothing had ever asked it. `runSyncCycle` is idempotent
  // and self-serialising, so the extra runs (including the false start when the hook's optimistic
  // initial `true` is corrected) cost one no-op each.
  useEffect(() => {
    if (!isOnline) return;
    void runSyncCycle().finally(() => {
      // Published, not just logged. `checkLocalDbLimit` returns the §17.7 verdict and its only other
      // output is a console.warn, which nobody on a site can see.
      useOfflineStore.getState().setLocalDbStatus(checkLocalDbLimit());
    });
  }, [isOnline]);

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
      <View style={styles.tabs}>
        <MobileNav />
      </View>
      {/* Side drawer (mockup 04) — overlays the tabs, opened from the TopBar hamburger. Renders null
          while closed, so it never intercepts touches until opened. */}
      <NavigationDrawer />
      {/* WHICH SITE AM I ON — mounted for the Site Worker only, and it holds ITSELF open until the
          question is answered (see the component). It replaces a redirect that used to bounce the
          worker to a route: a route carries a back chevron, so the one case that must not be
          escapable had a way out of it, and the shell had to keep pushing them back in.
          SITE_ENGINEER JOINED IT ON 2026-08-12 (PO decision), amending the "only this role" rule
          that stood here. That rule cited "the engineer's dashboard" as a screen that picks its own
          project — and it did, from a local chip row, which is exactly why nothing store-backed
          worked for the role: the Active Project bar and the Issues and Schedule insight cards all
          read `projectStore`, and only the worker ever wrote to it, so on the engineer's screens
          they rendered nothing at all. It took a device capture to see that. The restructured
          mockups draw the Active Project bar on all four of the role's screens, which is the same
          answer from the other direction.
          SAFETY_OFFICER JOINED ON 2026-08-13, for exactly the reason SITE_ENGINEER did. All three
          `mockup/mobile/07_safety_officer/` drawings open with the Active Project bar, and
          <ProjectContextBar /> renders NOTHING when nothing is chosen — so without this the bar the
          drawings put at the top of every one of the role's screens would simply be absent, and the
          Incidents/Checklists/Permits screens would have no project to scope their queries to.
          Every OTHER role still picks per screen (the managers' panels), and making them all answer
          up front would still be inventing a flow no drawing asks for. */}
      {role === CosRole.SITE_WORKER ||
      role === CosRole.SITE_ENGINEER ||
      role === CosRole.SAFETY_OFFICER ? (
        <SelectProjectSheet />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabs: { flex: 1 },
});
