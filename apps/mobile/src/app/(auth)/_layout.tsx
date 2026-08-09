// Auth stack layout — wraps login, OTP verification, and the two pre-auth legal documents.
//
// privacy-policy and terms-of-use live in this group because the root AuthGate redirects every
// non-(auth) route to login while unauthenticated, and both are reached from the login footer
// (PO 2026-08-03 and 2026-08-09 respectively).

import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="privacy-policy" />
      <Stack.Screen name="terms-of-use" />
    </Stack>
  );
}
