// Money at dashboard size — the Finance bento tiles' "฿1.24B" (mockup 06_project_manager/03_finance).
//
// WHY NOT `formatMoney`. That function is the invoice formatter: it always prints the full grouped
// amount to two decimals, so a ฿450,000,000 budget renders as `฿450,000,000.00` — 15 characters in a
// half-width tile at 20px. Correct, and unreadable there. This is the SAME number shortened for a
// glanceable KPI, and nothing else in the app may use it: an amount someone acts on (an approval, an
// invoice, a payment) must keep every digit.
//
// THE SYMBOL COMES FROM @cos/financial, not from a table here. Two symbol tables would be two things
// that have to agree about ฿ forever, and the day they disagree the wrong currency sits in front of a
// real number. `currencySymbol()` was exported from that package for exactly this call.
//
// THE SUFFIX IS NOT IN THIS FILE. "B"/"M" are English; the app ships Thai as well, and ล้าน /
// พันล้าน are the Thai words for these magnitudes. So this returns WHICH magnitude it scaled to and
// the screen prints the localised suffix — a hardcoded "B" here would have been an untranslatable
// string outside the i18n files.

import { Decimal, currencySymbol, formatMoney, toDecimal } from '@cos/financial';

/** The magnitude the figure was divided by. `none` = not scaled; the text is the exact amount. */
export type MoneyScale = 'none' | 'million' | 'billion';

export interface CompactMoney {
  /**
   * Currency symbol, a thin gap, then the scaled figure — `฿ 1.24`.
   *
   * THE SPACE IS THE PROJECT STANDARD (PO decision 2026-08-10): `฿ 805 M`, not `฿805M`. Three
   * glyph classes run together — a currency mark, digits and a magnitude letter — and jammed up
   * they read as one token; spaced, the eye takes the amount in one jump. The screen adds the
   * second gap before the localised suffix.
   */
  text: string;
  scale: MoneyScale;
}

const MILLION = new Decimal(1_000_000);
const BILLION = new Decimal(1_000_000_000);

/**
 * A monetary amount shortened for a KPI tile.
 *
 * Under a million the amount is returned EXACTLY as `formatMoney` would write it, cents and all —
 * at that size the full figure fits, and rounding a number that fits would be throwing away
 * precision for nothing.
 *
 * Trailing zeros are dropped (`฿450M`, not `฿450.00M`) because at this magnitude the hundredths are
 * hundreds of thousands of baht of false precision: the figure is already a rounded summary and
 * printing `.00` claims it landed exactly on the million.
 */
/** Options for the two functions below. */
export interface CompactMoneyOptions {
  /**
   * The largest magnitude the figure may be scaled to. Defaults to `billion`.
   *
   * `million` keeps ฿1,213,000,000 as `฿ 1,213 M` instead of promoting it to `฿ 1.21 B`. The
   * executive Home's budget hero passes it so its two figures share one unit and can be compared at
   * a glance — a budget in B beside its actual in M is two units in one card (PO 2026-09-07). The
   * Finance tiles keep the default, where each figure stands alone.
   */
  maxScale?: 'million' | 'billion';
}

/**
 * Comma-group the integer part of a plain decimal string. Never a float — the input is text.
 *
 * Split on the index rather than destructuring `split('.')`: the `[whole = '']` default that needed
 * is a branch no input can reach (`''.split('.')` is `['']`), and QM-1 asks for 100% of branches,
 * not 100% of the reachable ones.
 */
function group(text: string): string {
  const dot = text.indexOf('.');
  const whole = dot === -1 ? text : text.slice(0, dot);
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (dot === -1 ? '' : text.slice(dot));
}

export function compactMoney(
  amount: Decimal | string | number,
  currency = 'THB',
  options: CompactMoneyOptions = {},
): CompactMoney {
  const value = amount instanceof Decimal ? amount : toDecimal(amount);
  const magnitude = value.abs();

  if (magnitude.lessThan(MILLION)) {
    // Unscaled amounts keep `formatMoney`'s exact output — that is the invoice format, and an
    // amount someone acts on must read the same everywhere it appears.
    return { text: formatMoney(value, currency), scale: 'none' };
  }

  const capped = options.maxScale === 'million';
  let scale: MoneyScale = magnitude.lessThan(BILLION) || capped ? 'million' : 'billion';
  let scaled = value.dividedBy(scale === 'million' ? MILLION : BILLION).toDecimalPlaces(2);

  // 999,999,999 scales to 999.999999 million, which ROUNDS to 1000 — and "฿1000M" is a worse way of
  // writing "฿1B". Promote after rounding, not before, because it is the rounding that crosses the
  // boundary. Not when the caller capped the scale: there the four figures ARE the point.
  if (!capped && scale === 'million' && scaled.abs().greaterThanOrEqualTo(1000)) {
    scale = 'billion';
    scaled = value.dividedBy(BILLION).toDecimalPlaces(2);
  }

  // Sign in front of the symbol, matching `formatMoney` — that is how a credit reads in accounting.
  const sign = scaled.isNegative() ? '-' : '';
  // An unrecognised code already ends in a space (`formatMoney` prints "XAF 1,234.50"), so it must
  // not gain a second one.
  const symbol = currencySymbol(currency);
  const gap = symbol.endsWith(' ') ? '' : ' ';
  // Grouped, so a capped figure reads `฿ 1,213 M` rather than `฿ 1213 M`. A no-op below a thousand,
  // which is every figure the uncapped path can produce.
  return { text: `${sign}${symbol}${gap}${group(scaled.abs().toString())}`, scale };
}

/**
 * i18n key for the magnitude `compactMoney` scaled to — "M"/"B" in English, ล้าน/พันล้าน in Thai.
 *
 * The KEYS live here; the strings stay in the message files, for the reason at the head of this
 * file. It moved out of `app/(app)/finance.tsx` on 2026-09-05 when the Executive Home's portfolio
 * budget became the second consumer: two copies of this map are two places that would have to agree
 * about which magnitude gets which word.
 */
export const MONEY_SCALE_KEY: Record<MoneyScale, string | null> = {
  none: null,
  million: 'pm.finance.scaleMillion',
  billion: 'pm.finance.scaleBillion',
};

/**
 * A compact amount with its localised magnitude already appended — `฿ 805 M`, `฿ 1.21 B`.
 *
 * `translate` is typed structurally rather than as the app's `TranslateFn` on purpose: that type
 * lives in `i18n/index.tsx`, and importing a `.tsx` module here would drag React into the logic
 * suite, which runs these files under a CommonJS jest with no JSX transform. Same reason
 * `lib/delayInsight.ts` keeps its reading of the report out of the panel that uses it.
 */
export function compactMoneyLabel(
  amount: Decimal | string | number,
  currency: string,
  translate: (key: string) => string,
  options: CompactMoneyOptions = {},
): string {
  const { text, scale } = compactMoney(amount, currency, options);
  const key = MONEY_SCALE_KEY[scale];
  if (key === null) return text;
  // Thai's suffixes already carry their own leading space in the message file, so the gap is added
  // only where the key has none — the project's `฿ 805 M` standard (PO 2026-08-10).
  const suffix = translate(key);
  return `${text}${suffix.startsWith(' ') ? '' : ' '}${suffix}`;
}
