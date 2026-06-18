'use client';

import { useT } from '../../i18n';

/**
 * Honest system-state landing for roles whose operational pages are not yet
 * available (DECISION-2): SAFETY_OFFICER and any role whose §20.7 landing
 * depends on backend that is still a separate workstream. This is not invented
 * business content — it states the true availability and links to sign-out.
 */
export default function PendingPage() {
  const t = useT();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-bold text-gray-800">{t('auth.pending.title')}</h1>
      <p className="max-w-md text-sm text-gray-500">{t('auth.pending.body')}</p>
      <a href="/logout" className="mt-2 text-sm text-blue-600 hover:underline">
        {t('common.signOut')}
      </a>
    </main>
  );
}
