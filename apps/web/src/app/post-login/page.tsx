'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useT } from '../../i18n';
import { landingFor } from '../../lib/auth/roles';

/**
 * Post-login role router (§20.6.1 "post-login routing"). Both auth paths
 * (Keycloak OIDC redirect and OTP credentials) return here; we resolve the
 * role's landing page from the session claim and replace the history entry.
 */
export default function PostLoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const t = useT();

  useEffect(() => {
    if (status === 'loading') {
      return;
    }
    if (status === 'unauthenticated') {
      router.replace('/login');
      return;
    }
    router.replace(landingFor(session?.user?.role));
  }, [status, session, router]);

  return (
    <main className="flex min-h-screen items-center justify-center text-gray-500">
      {t('common.loading')}
    </main>
  );
}
