// Root layout — Expo Router entry point.
// Guards all (app) routes: redirects unauthenticated users to (auth)/login.

import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { useFonts } from 'expo-font';
import {
  InterTight_400Regular,
  InterTight_500Medium,
  InterTight_600SemiBold,
  InterTight_700Bold,
} from '@expo-google-fonts/inter-tight';
import { useAuthStore } from '../store/authStore';
import { initSyncQueue } from '../db/sync-queue';

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

  // Hold the UI until the brand font is ready so text never flashes in a fallback face.
  if (!fontsLoaded) return null;

  return (
    <>
      <AuthGate />
      <Slot />
    </>
  );
}
