// Root layout — Expo Router entry point.
// Guards all (app) routes: redirects unauthenticated users to (auth)/login.

import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { useFonts } from 'expo-font';
import * as Linking from 'expo-linking';
import {
  InterTight_400Regular,
  InterTight_500Medium,
  InterTight_600SemiBold,
  InterTight_700Bold,
} from '@expo-google-fonts/inter-tight';
import { useAuthStore } from '../store/authStore';
import { initSyncQueue } from '../db/sync-queue';
import { isE2EEnabled, setForcedOnline } from '../lib/e2e/networkOverride';

function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    const inAuthGroup = segments[0] === '(auth)';
    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(app)/home');
    }
  }, [isAuthenticated, segments, router]);

  return null;
}

export default function RootLayout() {
  // Brand font: Inter Tight (§32.7) — weights 400 body / 500 labels / 600 headings / 700 wordmark.
  const [fontsLoaded] = useFonts({
    InterTight_400Regular,
    InterTight_500Medium,
    InterTight_600SemiBold,
    InterTight_700Bold,
  });

  useEffect(() => {
    initSyncQueue();
  }, []);

  // E2E-only: let Detox toggle simulated connectivity via `cos://e2e/network?online=0|1`.
  // Inert in production (isE2EEnabled() is false). See lib/e2e/networkOverride + e2e/helpers.ts.
  useEffect(() => {
    if (!isE2EEnabled()) return;
    const handle = (url: string | null): void => {
      if (!url) return;
      const { hostname, path, queryParams } = Linking.parse(url);
      if (hostname !== 'e2e' || path !== 'network') return;
      const online = queryParams?.['online'];
      if (typeof online === 'string') setForcedOnline(online === '1' || online === 'true');
    };
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => sub.remove();
  }, []);

  // Hold the UI until the brand font is ready so text never flashes in a fallback face.
  if (!fontsLoaded) return null;

  return (
    <>
      <AuthGate />
      <Slot />
    </>
  );
}
