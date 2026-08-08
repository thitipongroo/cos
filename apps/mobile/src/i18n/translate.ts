// i18n core (QM-3) — dot-path key lookup with th→en fallback, ICU MessageFormat
// (intl-messageformat) for count/argument messages, and Buddhist-calendar date display
// for Thai via Intl (never Gregorian +543 arithmetic).

// ICU POLYFILLS — must come BEFORE intl-messageformat, which reads these globals when it formats.
//
// Hermes ships a PARTIAL Intl: it has DateTimeFormat, NumberFormat and Collator, but NOT PluralRules
// and NOT Locale. So on a real device every `{count, plural, …}` message threw inside formatIcu(),
// hit its catch, and rendered the RAW TEMPLATE — "Structural{count, plural, one {# worker} other
// {# workers}}" was on screen in the daily-report capture, and the three older plural strings
// (pending changes, unresolved conflicts, queued photos) had been doing the same thing unnoticed.
// Node and jest both have full ICU, so no unit test could ever have caught it.
//
// ORDER MATTERS AND IS NOT ALPHABETICAL. Each polyfill is self-gating (it installs only where the
// engine lacks the API), but they depend on each other at INSTALL time:
//   getCanonicalLocales → Locale → PluralRules
// PluralRules resolves its locale through @formatjs/intl-localematcher, which constructs
// `new Intl.Locale(...)`. Adding PluralRules alone therefore MOVED the failure rather than fixing it:
// the throw became `TypeError: undefined cannot be used as a constructor` inside
// findMatchingDistanceImpl — the matcher reaching for the Intl.Locale that Hermes does not have.
//
// QM-3 names "@formatjs/intl or equivalent ICU-compliant library" for exactly this. Locale data is
// imported for the two locales the app ships; adding a third locale means adding its data here too.
// The `.js` suffixes are REQUIRED, not stylistic: these packages' `exports` maps declare
// "./polyfill.js" and "./locale-data/*", so an extensionless specifier resolves in neither Metro nor
// jest ("Cannot find module '@formatjs/intl-pluralrules/polyfill'").
import '@formatjs/intl-getcanonicallocales/polyfill.js';
import '@formatjs/intl-locale/polyfill.js';
import '@formatjs/intl-pluralrules/polyfill.js';
import '@formatjs/intl-pluralrules/locale-data/en.js';
import '@formatjs/intl-pluralrules/locale-data/th.js';
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
    //
    // This fallback is also what HID the Hermes gap above for months: a missing Intl API throws here
    // and the user sees the template instead of an error, which reads as a copy bug rather than a
    // runtime one. The polyfills at the top of this file are the fix; `pluralPolyfill.spec.ts` keeps
    // them imported. Kept as a fallback rather than a rethrow because a malformed translation must
    // not take a field screen down.
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
