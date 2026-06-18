'use client';

import { useI18n, type Locale } from '../../i18n';

/** th/en language switcher (§20.5 / §20.6.2). */
export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const next: Locale = locale === 'th' ? 'en' : 'th';
  return (
    <button
      type="button"
      aria-label={t('shell.language')}
      onClick={() => setLocale(next)}
      className="rounded border border-gray-300 px-2 py-1 text-xs font-medium uppercase text-gray-600 hover:bg-gray-100"
    >
      {locale}
    </button>
  );
}
