// Auth stack layout — wraps login, OTP verification, and the pre-auth Privacy Policy.
//
// privacy-policy lives in this group because the root AuthGate redirects every non-(auth) route to
// login while unauthenticated, and the policy is reached from the login footer (PO 2026-08-03).

import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="privacy-policy" />
    </Stack>
  );
}
