// Index route for '/'. Without it, a cold launch resolves to an unmatched route (expo-router shows
// "Unmatched Route") because the AuthGate redirect runs asynchronously. Redirecting here is synchronous
// and deterministic. The root layout holds rendering until the session is hydrated, so isAuthenticated
// is correct by the time this renders.
//
// The authenticated target is the ROLE'S FIRST TAB, not a fixed /home: SITE_WORKER has no Home tab
// (PO 2026-08-08), so sending it there landed it on a screen its own bottom bar could not reach.
// See lib/landingRoute.

import { Redirect } from 'expo-router';
import { CosRole } from '@cos/types';
import { useAuthStore } from '../store/authStore';
import { landingRouteFor } from '../lib/landingRoute';

export default function Index() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.role) as CosRole | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- expo-router's typed href union
  return <Redirect href={(isAuthenticated ? landingRouteFor(role) : '/(auth)/login') as any} />;
}
