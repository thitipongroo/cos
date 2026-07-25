'use client';

import { useI18n, type Locale } from '../../i18n';

/** Flag shown for each locale (bundled SVGs in public/flags): Thai flag for th, Union Jack for en. */
const LOCALE_FLAG: Record<Locale, string> = { th: 'th', en: 'gb' };

/**
 * th/en language switcher (§20.5 / §20.6.2). Shows the current locale's national flag + code.
 * `className` overrides the default (light app-shell) styling so the same control can be dropped onto
 * the dark login surface (default locale is en per PO 2026-07-26; this only lets the user switch).
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  const next: Locale = locale === 'th' ? 'en' : 'th';
  return (
    <button
      type="button"
      aria-label={t('shell.language')}
      onClick={() => setLocale(next)}
      className={`inline-flex items-center gap-1.5 ${
        className ??
        'rounded border border-gray-300 px-2 py-1 text-xs font-medium uppercase text-gray-600 hover:bg-gray-100'
      }`}
    >
      {/* Bundled flag SVG (plain <img> — dependency-free, same pattern as the OTP country picker). */}
      <img
        src={`/flags/${LOCALE_FLAG[locale]}.svg`}
        alt=""
        aria-hidden="true"
        className="h-3 w-[18px] shrink-0 rounded-[2px] object-cover"
      />
      {locale}
    </button>
  );
}
