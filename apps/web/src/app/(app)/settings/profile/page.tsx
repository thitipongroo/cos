'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useI18n } from '../../../../i18n';
import { LanguageSwitcher } from '../../../../components/shell/LanguageSwitcher';

/** Personal account page (name/role/organization + locale + sign out). §20.7 defines no dedicated
 *  profile route; this extends the settings/* area (Procore/Jira "account settings" pattern). */
export default function ProfilePage() {
  const { data: session } = useSession();
  const { t } = useI18n();
  const user = session?.user;

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-bold text-gray-800">{t('profile.title')}</h1>

      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
        <Field label={t('profile.name')} value={user?.name ?? '—'} />
        <Field label={t('profile.email')} value={user?.email ?? '—'} />
        <Field label={t('profile.role')} value={user?.role ?? '—'} />
        <Field label={t('profile.tenant')} value={user?.tenantId ?? '—'} />
        <div className="flex items-center justify-between border-t border-gray-100 pt-4">
          <span className="text-sm text-gray-500">{t('profile.language')}</span>
          <LanguageSwitcher />
        </div>
      </div>

      <Link
        href="/logout"
        className="mt-6 inline-block rounded-md border-2 border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
      >
        {t('common.signOut')}
      </Link>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-800">{value}</span>
    </div>
  );
}
