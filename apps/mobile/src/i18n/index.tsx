// I18nProvider + hooks (QM-3) — mirrors the apps/web/src/i18n API adapted for React Native:
// dot-path keys, with the default and fallback locales owned by ./translate (both 'en' — PO decision
// 2026-07-26, which overrides QM-3's th-TH; this header said 'th' until 2026-08-20). Locale state
// lives in the zustand localeStore (SecureStore-persisted); ICU/plural + Buddhist-calendar dates in
// ./translate.

import { createContext, useCallback, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useLocaleStore } from '../store/localeStore';
import {
  translate,
  statusLabel as statusLabelFor,
  formatDate as formatDateFor,
  formatTime as formatTimeFor,
} from './translate';
import type { Locale } from './translate';

export { isRTL } from './direction';
export {
  translate,
  statusLabel,
  formatDate,
  formatTime,
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
} from './translate';
export type { Locale } from './translate';

export type TranslateFn = (key: string, values?: Record<string, unknown>) => string;

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslateFn;
  statusLabel: (status: string) => string;
  formatDate: (date: Date | string) => string;
  formatTime: (date: Date | string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useLocaleStore((s) => s.locale);
  const persistLocale = useLocaleStore((s) => s.setLocale);

  const setLocale = useCallback(
    (next: Locale) => {
      void persistLocale(next);
    },
    [persistLocale],
  );

  const t = useCallback<TranslateFn>((key, values) => translate(locale, key, values), [locale]);
  const statusLabel = useCallback((status: string) => statusLabelFor(locale, status), [locale]);
  const formatDate = useCallback((date: Date | string) => formatDateFor(date, locale), [locale]);
  const formatTime = useCallback((date: Date | string) => formatTimeFor(date, locale), [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t, statusLabel, formatDate, formatTime }),
    [locale, setLocale, t, statusLabel, formatDate, formatTime],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within <I18nProvider>');
  }
  return ctx;
}

/** Convenience hook returning just the translate function. */
export function useT(): TranslateFn {
  return useI18n().t;
}
