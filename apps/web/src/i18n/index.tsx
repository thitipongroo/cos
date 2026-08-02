'use client';

/**
 * Minimal i18n for the web client: default locale `en` (PO 2026-07-26, overrides QM-3), fallback `en`.
 * All user-facing strings resolve through `useT()` — no hardcoded copy in pages.
 * Locale is persisted in localStorage and toggled via the app-shell switcher.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { applyDocumentLocale } from '../lib/locale';
import en from './en.json';
import th from './th.json';

export type Locale = 'th' | 'en';

const MESSAGES: Record<Locale, Record<string, unknown>> = { th, en };
const STORAGE_KEY = 'cos.locale';
// Default UI language is English (product-owner decision 2026-07-26 — overrides QM-3's th-TH default).
const DEFAULT_LOCALE: Locale = 'en';
const FALLBACK_LOCALE: Locale = 'en';

/** Resolve a dot-path (e.g. "auth.login.title") against a nested messages object. */
function lookup(messages: Record<string, unknown>, key: string): string | undefined {
  const value = key.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, messages);
  return typeof value === 'string' ? value : undefined;
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'th' || stored === 'en') {
      setLocaleState(stored);
    }
  }, []);

  // Keep <html lang>/<dir> in step with `locale` from a single effect rather than only inside
  // setLocale. Previously a user who had chosen Thai got `lang="en"` on every subsequent visit:
  // the restore path above sets state without going through setLocale, so the attribute was only
  // ever corrected by clicking the switcher again. A screen reader then reads Thai with an English
  // voice — invisible on screen, and no automated check catches it (checklist item B1).
  useEffect(() => {
    applyDocumentLocale(locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const t = useCallback(
    (key: string): string =>
      lookup(MESSAGES[locale], key) ?? lookup(MESSAGES[FALLBACK_LOCALE], key) ?? key,
    [locale],
  );

  const value = useMemo<I18nContextValue>(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

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
export function useT(): (key: string) => string {
  return useI18n().t;
}
