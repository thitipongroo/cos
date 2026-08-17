// Auth stack layout — wraps login, OTP verification, the two pre-auth legal documents, and the
// pre-auth Support Center.
//
// privacy-policy, terms-of-use and support live in this group because the root AuthGate redirects
// every non-(auth) route to login while unauthenticated, and all three are reached from a login
// footer: the first two from the phone step, support from the OTP step's GET SUPPORT item
// (PO 2026-08-03 and 2026-08-09).
//
// AuthGate redirects in BOTH directions — `isAuthenticated && inAuthGroup → /(app)/home` — so a
// signed-in user cannot be sent to any route in this group. Two of these screens are also wanted
// after sign-in, and each has its own (app) twin rather than a link across the boundary:
// privacy-policy (PO 2026-08-04) and support (PO 2026-08-17). The twins share the document component
// and differ in frame and extras; they are not duplicated content.

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
