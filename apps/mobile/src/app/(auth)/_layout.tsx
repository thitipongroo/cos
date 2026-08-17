// Auth stack layout — wraps login, OTP verification, the two pre-auth legal documents, the pre-auth
// Support Center, and the Privacy Policy's eight section and flow screens.
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
//
// The eight `privacy-*` screens joined them on 2026-08-17 (product-owner decision): the policy's five
// sections became pushed routes instead of accordion bodies, matching
// mockup/mobile/01_authen/05_privacy_policy/02…06, each of which is drawn as a full screen, and
// 07…09 added the DPO contact flow and the download receipt (ADR-091). They are flat files in this
// group rather than a nested directory — a directory under (app)/ would slip past
// lib/__tests__/routeRegistry.spec.ts, which enumerates flat route files only, and auto-register as a
// visible bottom tab.
//
// NONE of the eight gets an (app) twin, unlike the two screens above, and that is a decision rather
// than an omission. The signed-in policy route keeps its accordion because the Transparency Portal
// already sits beneath it and shows the reader their OWN record — deeper than any section screen —
// and a signed-in user has the account-holder export routes (ADR-078) instead of a free-text request.

import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="privacy-policy" />
      <Stack.Screen name="privacy-data-collection" />
      <Stack.Screen name="privacy-data-usage" />
      <Stack.Screen name="privacy-pdpa-gdpr" />
      <Stack.Screen name="privacy-technical-security" />
      <Stack.Screen name="privacy-user-rights" />
      {/* ADR-091 — the DPO contact form and its receipt. The receipt is reached with router.replace,
          so it is terminal: the form is gone from the stack by the time it renders. */}
      <Stack.Screen name="privacy-contact" />
      <Stack.Screen name="privacy-contact-sent" />
      {/* ADR-091 — the download receipt, reached after the PDF is on disk and its digest checked. */}
      <Stack.Screen name="privacy-policy-downloaded" />
      <Stack.Screen name="terms-of-use" />
      <Stack.Screen name="support" />
    </Stack>
  );
}
