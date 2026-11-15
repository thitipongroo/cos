import type { Locale } from '../i18n';

/** BCP-47 tag per app locale; th uses the Buddhist calendar for display (QM-3). */
export function localeTag(locale: Locale): string {
  return locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-US';
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * `"YYYY-MM-DD"` of the LOCAL calendar day. Not `toISOString().slice(0, 10)`: that is the UTC day,
 * which in Bangkok (UTC+7) is still yesterday before 07:00.
 */
export function localIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * `"YYYY-MM-DDTHH:MM"` of the LOCAL wall clock — the value an `<input type="datetime-local">` holds.
 * `toISOString().slice(0, 16)` put the UTC clock there, which the form then read back as local time:
 * a delivery saved with the default time was stored seven hours early in Bangkok.
 */
export function localDatetimeInput(d: Date): string {
  return `${localIsoDate(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Default analytics window: last 90 days as "YYYY-MM-DD,YYYY-MM-DD", ending on the local today. */
export function defaultDateRange(now: Date = new Date()): string {
  const start = new Date(now);
  start.setDate(start.getDate() - 90);
  return `${localIsoDate(start)},${localIsoDate(now)}`;
}

/** Currency via Intl.NumberFormat (QM-3 — never raw concatenation). */
export function formatMoney(
  locale: Locale,
  amount: string | null,
  currency: string | null,
): string {
  if (amount === null) {
    return '—';
  }
  const value = Number(amount);
  if (Number.isNaN(value)) {
    return amount;
  }
  return new Intl.NumberFormat(localeTag(locale), {
    style: currency ? 'currency' : 'decimal',
    currency: currency ?? undefined,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(locale: Locale, value: number): string {
  return new Intl.NumberFormat(localeTag(locale), {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value / 100);
}

export function formatDate(locale: Locale, iso: string | null): string {
  if (!iso) {
    return '—';
  }
  return new Intl.DateTimeFormat(localeTag(locale), { dateStyle: 'medium' }).format(new Date(iso));
}

/** Date and time, seconds included — an audit timestamp is read to the second (R17 audit screens). */
export function formatDateTime(locale: Locale, iso: string | null): string {
  if (!iso) {
    return '—';
  }
  return new Intl.DateTimeFormat(localeTag(locale), {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(iso));
}

/** Time of day with seconds — the second half of an audit ledger timestamp, drawn apart from the date (R17). */
export function formatTime(locale: Locale, iso: string | null): string {
  if (!iso) {
    return '—';
  }
  return new Intl.DateTimeFormat(localeTag(locale), { timeStyle: 'medium' }).format(new Date(iso));
}
