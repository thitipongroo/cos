'use client';

import { signOut } from 'next-auth/react';
import { useEffect } from 'react';
import { useT } from '../../i18n';

/**
 * Logout (§20.6.1) — clears the local next-auth session; the server-side
 * `events.signOut` in auth options performs Keycloak RP-initiated logout for
 * OIDC sessions. Redirects to the login page afterwards.
 */
export default function LogoutPage() {
  const t = useT();

  useEffect(() => {
    void signOut({ callbackUrl: '/login' });
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center text-gray-500">
      {t('auth.logout.title')}
    </main>
  );
}
