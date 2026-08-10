// Auth stack layout — wraps login, OTP verification, the two pre-auth legal documents, and the
// pre-auth Support Center.
//
// privacy-policy, terms-of-use and support live in this group because the root AuthGate redirects
// every non-(auth) route to login while unauthenticated, and all three are reached from a login
// footer: the first two from the phone step, support from the OTP step's GET SUPPORT item
// (PO 2026-08-03 and 2026-08-09).

import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="privacy-policy" />
      <Stack.Screen name="terms-of-use" />
      <Stack.Screen name="support" />
    </Stack>
  );
}
