// i18n core (QM-3) — dot-path key lookup with th→en fallback, ICU MessageFormat
// (intl-messageformat) for count/argument messages, and Buddhist-calendar date display
// for Thai via Intl (never Gregorian +543 arithmetic).

import { IntlMessageFormat } from 'intl-messageformat';
import en from './en.json';
import th from './th.json';

export type Locale = 'th' | 'en';

// Default UI language is English (product-owner decision 2026-07-26 — overrides QM-3's th-TH default;
// docs updated to match). Users can still switch to Thai; Buddhist-era formatting applies when they do.
export const DEFAULT_LOCALE: Locale = 'en';
export const FALLBACK_LOCALE: Locale = 'en';

const MESSAGES: Record<Locale, Record<string, unknown>> = { th, en };
const LOCALE_TAGS: Record<Locale, string> = { th: 'th-TH', en: 'en-US' };

/** Resolve a dot-path (e.g. "site.reports.title") against a nested messages object. */
export function lookup(messages: Record<string, unknown>, key: string): string | undefined {
  const value = key.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, messages);
  return typeof value === 'string' ? value : undefined;
}

const formatterCache = new Map<string, IntlMessageFormat>();

function formatIcu(message: string, locale: Locale, values?: Record<string, unknown>): string {
  const cacheKey = `${locale}:${message}`;
  let formatter = formatterCache.get(cacheKey);
  if (!formatter) {
    formatter = new IntlMessageFormat(message, LOCALE_TAGS[locale]);
    formatterCache.set(cacheKey, formatter);
  }
  return String(formatter.format(values));
}

export function translate(locale: Locale, key: string, values?: Record<string, unknown>): string {
  const message = lookup(MESSAGES[locale], key) ?? lookup(MESSAGES[FALLBACK_LOCALE], key);
  if (message === undefined) return key;
  if (!message.includes('{')) return message;
  try {
    return formatIcu(message, locale, values);
  } catch {
    // Missing ICU arguments or malformed message — show the raw template, never crash the UI.
    return message;
  }
}

/** Translate a server status/severity code (e.g. "PENDING"); unknown codes display as-is. */
export function statusLabel(locale: Locale, status: string): string {
  return (
    lookup(MESSAGES[locale], `status.${status}`) ??
    lookup(MESSAGES[FALLBACK_LOCALE], `status.${status}`) ??
    status
  );
}

function toDate(date: Date | string): Date {
  return typeof date === 'string' ? new Date(date) : date;
}

/** Display a date in the user's locale — Buddhist Era calendar for Thai (QM-3). */
export function formatDate(date: Date | string, locale: Locale): string {
  const value = toDate(date);
  if (Number.isNaN(value.getTime())) return '';
  const tag = locale === 'th' ? 'th-TH-u-ca-buddhist' : LOCALE_TAGS.en;
  return new Intl.DateTimeFormat(tag, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(value);
}

/** Display a time of day in the user's locale. */
export function formatTime(date: Date | string, locale: Locale): string {
  const value = toDate(date);
  if (Number.isNaN(value.getTime())) return '';
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}
