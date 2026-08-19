// Root layout — Expo Router entry point.
// Guards all (app) routes: redirects unauthenticated users to (auth)/login.

import { useEffect, useState } from 'react';
import { StyleSheet, LogBox } from 'react-native';
import { Slot, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { useFonts } from 'expo-font';
import * as Linking from 'expo-linking';
import {
  InterTight_400Regular,
  InterTight_500Medium,
  InterTight_600SemiBold,
  InterTight_700Bold,
} from '@expo-google-fonts/inter-tight';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuthStore } from '../store/authStore';
import { useLocaleStore } from '../store/localeStore';
import { useThemeStore } from '../store/themeStore';
import { useBiometricStore } from '../store/biometricStore';
import { I18nProvider } from '../i18n';
import { initSyncQueue, subscribeQueueChanged, countPending } from '../db/sync-queue';
import { startQueueObserver } from '../sync/queueObserver';
import { runSyncCycle } from '../sync/syncRunner';
import { registerBackgroundSyncTask, scheduleBackgroundSync } from '../sync/BackgroundSyncTask';
import { useSyncStore } from '../store/syncStore';
import { isE2EEnabled, setForcedOnline } from '../lib/e2e/networkOverride';
import { LoadingBoundary } from '../components/LoadingBoundary';
import { BiometricLock } from '../components/BiometricLock';
import { darkColors } from '../theme/tokens';
import appFavicon from '../../assets/favicon.png';

// Screenshot builds (Metro started with EXPO_PUBLIC_CAPTURE=1) suppress the dev-only LogBox toast
// ("Open debugger to view warnings.") so it never lands in a documentation screenshot — including the
// transient app-launch loading state, which is too brief to dismiss the toast by hand. Red-box errors
// still surface, and normal `expo start` is unaffected (the flag is set only by the capture workflow).
if (process.env.EXPO_PUBLIC_CAPTURE === '1') {
  LogBox.ignoreAllLogs(true);
}

// Brand tagline shown on the app-launch loading state. This renders BEFORE I18nProvider mounts and
// before the persisted locale is known, so it cannot come from i18n — it is the English brand
// default (QM-3's system default), matching the wordmark on the native splash. `\n` splits the two
// lines exactly as the login hero renders heroTitle / heroTitle2.
const LAUNCH_TAGLINE = 'AI-NATIVE\nConstruction Platform';

// Interactive label shown before the launch percentage ("Loading… 50%"). Hardcoded, not i18n, for the
// same reason as the tagline — this renders before I18nProvider mounts (QM-3's English system default);
// it mirrors the `common.loadingLabel` string the rest of the app resolves through i18n.
const LAUNCH_LABEL = 'Loading…';

function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const navState = useRootNavigationState();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    // Wait until the root navigator is actually mounted, otherwise expo-router throws
    // "Attempted to navigate before mounting the Root Layout component".
    if (!navState?.key) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(app)/home');
    }
  }, [navState?.key, isAuthenticated, segments, router]);

  return null;
}

export default function RootLayout() {
  // Brand font: Inter Tight (§32.7) — weights 400 body / 500 labels / 600 headings / 700 wordmark.
  const [fontsLoaded, fontError] = useFonts({
    InterTight_400Regular,
    InterTight_500Medium,
    InterTight_600SemiBold,
    InterTight_700Bold,
  });

  // Gate the first render until the persisted session is restored, so AuthGate makes its
  // authenticated/unauthenticated decision ONCE with the correct state (avoids a login↔home flip
  // race after a cold start / reloadReactNative). `.finally` guarantees we never block forever.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    initSyncQueue();

    // Publish the outbox depth to the store that <SyncPill /> reads, now and on every queue change.
    // Nothing wrote `pendingCount` before this, so the pill reported "synced" to a device holding a
    // full outbox — see sync/queueObserver.ts.
    const stopQueueObserver = startQueueObserver({
      subscribe: subscribeQueueChanged,
      countPending,
      setPendingCount: useSyncStore.getState().setPendingCount,
    });

    // Define and schedule the OS background sync job (§Phase 10 Background Sync). Both halves were
    // written and neither was ever called, so the task was never registered with TaskManager and the
    // 15-minute job never existed. Scheduling can reject (the OS refuses in Background App Refresh
    // "off", and it is unavailable in Expo Go) — that is a degraded mode, not a launch failure.
    registerBackgroundSyncTask(runSyncCycle);
    void scheduleBackgroundSync().catch(() => {
      /* background refresh unavailable — foreground + reconnect sync still run */
    });

    void Promise.all([
      useAuthStore.getState().hydrate(),
      useLocaleStore.getState().hydrate(),
      // The delta cursor, so the first pull after a cold start is incremental instead of asking for
      // everything since 1970 (it was held in memory only until 2026-08-19).
      useSyncStore.getState().hydrate(),
      // Theme is hydrated in the same gate as the session and locale so the first painted frame is
      // already in the user's mode — hydrating later would flash the default dark shell at someone
      // who has chosen light.
      useThemeStore.getState().hydrate(),
      // Read the biometric preference in the same gate, then raise the lock BEFORE the app tree
      // mounts. Hydrating it later would paint the authenticated screens for a frame first, which is
      // precisely the glimpse the lock exists to prevent.
      useBiometricStore
        .getState()
        .hydrate()
        .then(() => useBiometricStore.getState().lockIfEnabled()),
    ]).finally(() => setHydrated(true));

    // Re-raise the biometric gate every time the app comes back to the foreground, not only on a cold
    // start — see store/biometricStore.watchAppState for why per-launch was the wrong granularity.
    const stopAppStateWatch = useBiometricStore.getState().watchAppState();

    return () => {
      stopQueueObserver();
      stopAppStateWatch();
    };
  }, []);

  // E2E-only: let Detox toggle simulated connectivity via `cos://e2e/network?online=0|1`.
  // Inert in production (isE2EEnabled() is false). See lib/e2e/networkOverride + e2e/helpers.ts.
  useEffect(() => {
    if (!isE2EEnabled()) return;
    const handle = (url: string | null): void => {
      if (!url) return;
      const { hostname, path, queryParams } = Linking.parse(url);
      if (hostname !== 'e2e') return;
      if (path === 'network') {
        const online = queryParams?.['online'];
        if (typeof online === 'string') setForcedOnline(online === '1' || online === 'true');
      } else if (path === 'reset') {
        // Clear any persisted session so a suite can start from a known logged-out state — the iOS
        // keychain survives app reinstall (`delete: true`), so without this the login tests would
        // launch already authenticated. See e2e/helpers.ts resetSession().
        setForcedOnline(null);
        void useAuthStore.getState().logout();
      }
    };
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => sub.remove();
  }, []);

  // Hold the first render until the session is hydrated (fast local SecureStore read) so AuthGate
  // routes correctly, AND until the brand font has resolved.
  //
  // The font gate is not cosmetic: text laid out before Inter Tight resolves is measured with the
  // fallback face, and the swap does not re-measure — Android then clips the last glyph of the wider
  // brand face ("CONSTRUCTION OS" drew as "CONSTRUCTION", "AI-NATIVE" as "AI-NATIV", "+66" as "+6",
  // while the view tree held the full strings). It only shows on a cold start, so it comes and goes.
  //
  // An earlier note here avoided blocking for fear of a permanently blank screen if the font hangs or
  // fails; `fontError` covers that — useFonts reports a failure and we render with the fallback.
  //
  // While the session hydrates and the brand font resolves, show the app-launch loading state — the
  // reusable <LoadingState /> widget (ADR-055 "loading A") on a dark ground — instead of holding the
  // native splash. It renders the app favicon + brand tagline (LAUNCH_TAGLINE) over the progress bar,
  // continuing the native splash's identity, and unmounts the instant the app is ready.
  // Honest launch progress: two steps — session hydration and the brand font. Both the tagline and the
  // "Loading…" label are the English brand default, not i18n: this renders before I18nProvider mounts
  // and before the persisted locale is known (QM-3's system default).
  const launchSteps = (hydrated ? 1 : 0) + (fontsLoaded || fontError ? 1 : 0);

  // The launch loading and the app tree share one <LoadingBoundary>, so when hydration + the brand font
  // settle the launch widget crossfades out over the freshly-mounted app instead of the old hard cut
  // (PO 2026-08-01 — "make loading→screen transitions seamless"). The app tree is not mounted until the
  // gate opens, so nothing renders against a half-hydrated session.
  return (
    <LoadingBoundary
      loading={launchSteps < 2}
      variant="widget"
      theme="dark"
      progress={(launchSteps / 2) * 100}
      iconSource={appFavicon}
      heading={LAUNCH_TAGLINE}
      label={LAUNCH_LABEL}
      style={styles.launch}
      loaderStyle={styles.launchLoader}
      testID="app-launch-loading"
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <I18nProvider>
            <AuthGate />
            <Slot />
            {/* Above <Slot />, so the lock covers whatever route is mounted. Renders null unless the
                gate is up — the users who never enable it pay nothing for it. It sits INSIDE
                I18nProvider because its copy is translated, and outside the (app) group because the
                session is what it guards, not any particular screen. */}
            <BiometricLock />
          </I18nProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </LoadingBoundary>
  );
}

const styles = StyleSheet.create({
  // Full-screen dark ground shared by the launch loader and the app it crossfades to — matches the app
  // shell, not the navy splash.
  launch: {
    flex: 1,
    backgroundColor: darkColors.bg,
  },
  // Centres the launch widget on that ground (kept on the loader itself so it stays centred through the
  // crossfade, not on the wrapper the app also fills).
  launchLoader: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
});
