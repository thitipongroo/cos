'use client';

import { signIn } from 'next-auth/react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useT } from '../../i18n';

/**
 * Login (§20.6.1). Path B (office/management) uses Keycloak OIDC — the hosted
 * Keycloak login page handles email+password AND the MFA (TOTP) step required
 * for TENANT_ADMIN/FINANCE, so no separate web MFA page is introduced (no new
 * auth mechanism per §20.6). Path A (field roles) is reached via the OTP link.
 */
export default function LoginPage() {
  const t = useT();
  const searchParams = useSearchParams();
  const hasError = searchParams.get('error') !== null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <Image
          src="/icons/logo-dark.png"
          alt={t('common.appName')}
          width={200}
          height={34}
          priority
          className="mx-auto mb-2 h-auto w-[200px]"
        />
        <p className="mb-6 text-center text-sm text-gray-500">{t('auth.login.office')}</p>

        {hasError && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {t('auth.login.error')}
          </div>
        )}

        <button
          type="button"
          onClick={() => signIn('keycloak', { callbackUrl: '/post-login' })}
          className="w-full rounded-md bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700"
        >
          {t('auth.login.officeButton')}
        </button>

        <div className="mt-6 text-center">
          <Link href="/login/otp" className="text-sm text-blue-600 hover:underline">
            {t('auth.login.fieldLink')}
          </Link>
        </div>
      </div>
    </main>
  );
}
