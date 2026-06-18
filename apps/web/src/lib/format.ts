import type { Locale } from '../i18n';

/** BCP-47 tag per app locale; th uses the Buddhist calendar for display (QM-3). */
export function localeTag(locale: Locale): string {
  return locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-US';
}

/** Default analytics window: last 90 days as "YYYY-MM-DD,YYYY-MM-DD". */
export function defaultDateRange(): string {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 90);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return `${iso(start)},${iso(end)}`;
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
