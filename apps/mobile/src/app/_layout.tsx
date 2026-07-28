// Root layout — Expo Router entry point.
// Guards all (app) routes: redirects unauthenticated users to (auth)/login.

import { useEffect, useState } from 'react';
import { View, StyleSheet, LogBox } from 'react-native';
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
import { I18nProvider } from '../i18n';
import { initSyncQueue } from '../db/sync-queue';
import { isE2EEnabled, setForcedOnline } from '../lib/e2e/networkOverride';
import { LoadingState } from '../components/LoadingState';
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
    void Promise.all([
      useAuthStore.getState().hydrate(),
      useLocaleStore.getState().hydrate(),
    ]).finally(() => setHydrated(true));
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
  if (launchSteps < 2) {
    return (
      <View style={styles.launch}>
        <LoadingState
          variant="widget"
          theme="dark"
          progress={(launchSteps / 2) * 100}
          iconSource={appFavicon}
          heading={LAUNCH_TAGLINE}
          label={LAUNCH_LABEL}
          testID="app-launch-loading"
        />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <I18nProvider>
          <AuthGate />
          <Slot />
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  // Full-screen dark ground for the launch loading — matches the app shell, not the navy splash.
  launch: {
    flex: 1,
    backgroundColor: darkColors.bg,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
});
