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
export function compactMoney(amount: Decimal | string | number, currency = 'THB'): CompactMoney {
  const value = amount instanceof Decimal ? amount : toDecimal(amount);
  const magnitude = value.abs();

  if (magnitude.lessThan(MILLION)) {
    // Unscaled amounts keep `formatMoney`'s exact output — that is the invoice format, and an
    // amount someone acts on must read the same everywhere it appears.
    return { text: formatMoney(value, currency), scale: 'none' };
  }

  let scale: MoneyScale = magnitude.lessThan(BILLION) ? 'million' : 'billion';
  let scaled = value.dividedBy(scale === 'million' ? MILLION : BILLION).toDecimalPlaces(2);

  // 999,999,999 scales to 999.999999 million, which ROUNDS to 1000 — and "฿1000M" is a worse way of
  // writing "฿1B". Promote after rounding, not before, because it is the rounding that crosses the
  // boundary.
  if (scale === 'million' && scaled.abs().greaterThanOrEqualTo(1000)) {
    scale = 'billion';
    scaled = value.dividedBy(BILLION).toDecimalPlaces(2);
  }

  // Sign in front of the symbol, matching `formatMoney` — that is how a credit reads in accounting.
  const sign = scaled.isNegative() ? '-' : '';
  // An unrecognised code already ends in a space (`formatMoney` prints "XAF 1,234.50"), so it must
  // not gain a second one.
  const symbol = currencySymbol(currency);
  const gap = symbol.endsWith(' ') ? '' : ' ';
  return { text: `${sign}${symbol}${gap}${scaled.abs().toString()}`, scale };
}
