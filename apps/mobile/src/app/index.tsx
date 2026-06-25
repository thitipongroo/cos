// Index route for '/'. Without it, a cold launch resolves to an unmatched route (expo-router shows
// "Unmatched Route") because the AuthGate redirect runs asynchronously. Redirecting here is synchronous
// and deterministic. The root layout holds rendering until the session is hydrated, so isAuthenticated
// is correct by the time this renders.

import { Redirect } from 'expo-router';
import { useAuthStore } from '../store/authStore';

export default function Index() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return <Redirect href={isAuthenticated ? '/(app)/home' : '/(auth)/login'} />;
}
