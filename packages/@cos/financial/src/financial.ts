// @cos/financial — Decimal.js monetary calculation utilities
// QM: NEVER use native JS float for money. Always use this package.
// Source: context/00_master_construction_os.md §FINANCIAL PRECISION SPEC

import Decimal from 'decimal.js';

// Configure global rounding mode: HALF_UP (standard commercial rounding)
Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

/**
 * Multiplies quantity × unit price and rounds to 4 decimal places (HALF_UP).
 * PostgreSQL storage: DECIMAL(19,4)
 */
export function calculateLineTotal(quantity: Decimal, unitPrice: Decimal): Decimal {
  return quantity.mul(unitPrice).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

/**
 * Converts an amount using an exchange rate.
 * Rate precision: DECIMAL(19,6) in storage.
 */
export function convertCurrency(amount: Decimal, exchangeRate: Decimal): Decimal {
  return amount.mul(exchangeRate).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

/**
 * Sums an array of Decimal values with HALF_UP rounding on final result.
 */
export function sumDecimals(values: Decimal[]): Decimal {
  return values.reduce((acc, val) => acc.plus(val), new Decimal(0));
}

/**
 * Formats a Decimal for display (2 decimal places).
 * Internal storage always uses 4 decimal places.
 */
export function formatForDisplay(amount: Decimal): string {
  return amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

/** Parse a string or number to Decimal safely. */
export function toDecimal(value: string | number): Decimal {
  return new Decimal(value);
}

/**
 * ISO 4217 code → the symbol to render in front of the amount.
 *
 * Only codes the platform actually deals with. An unknown code is NOT guessed at — `formatMoney`
 * falls back to printing the code itself, which is unambiguous, rather than inventing a glyph.
 */
const CURRENCY_SYMBOL: Readonly<Record<string, string>> = {
  THB: '฿',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  SGD: 'S$',
  VND: '₫',
  MYR: 'RM',
  IDR: 'Rp',
};

/**
 * Group the integer part in threes with commas. Written out rather than delegated to
 * `toLocaleString` / `Intl.NumberFormat` on purpose:
 *
 *   - `Intl` output depends on the device locale, so the same invoice would read `1,234.56` on one
 *     handset and `1.234,56` on another. DESIGN.md §9.5 specifies ONE presentation.
 *   - React Native ships a trimmed ICU on Android unless `jsEngine` is configured for full ICU, so
 *     `toLocaleString` silently degrades on some devices — the failure is invisible in review and
 *     shows up in the field.
 */
function groupThousands(intDigits: string): string {
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format money for display: symbol, comma-grouped thousands, exactly two decimals.
 *
 * DESIGN.md §9.5 / spec §32.5: money is stored `DECIMAL(19,4)` and **displayed at 2 decimal
 * places**, currency is ISO 4217, and THB renders `฿1,234,567.89`. Rounding is HALF_UP via
 * `formatForDisplay`, so the displayed figure is the stored figure correctly rounded — never a float
 * artefact (QM-3: never use native JS float for money).
 *
 * Negative amounts keep the sign in front of the symbol (`-฿1,200.00`), which is how a credit or a
 * reversal reads in an accounting context.
 */
export function formatMoney(amount: Decimal | string | number, currency = 'THB'): string {
  const value = amount instanceof Decimal ? amount : toDecimal(amount);
  // Round FIRST, then decide the sign from the rounded figure. Reading the sign off the raw value
  // renders `-0.001` as "-฿0.00" — a minus sign in front of nothing, which on a payment screen reads
  // as a credit that does not exist.
  const rounded = value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const fixed = formatForDisplay(rounded.abs());
  // No destructuring defaults here on purpose. `fixed` comes from formatForDisplay, which is
  // `toFixed(2)` — always exactly one '.' and two decimals — so `split('.')` always yields two
  // non-empty parts and any default is dead code. istanbul counts each default as a branch, so the
  // pair that used to sit here (`= '0'`, `= '00'`) was permanently unreachable and held this package
  // at 81.81% branch coverage, below the QM-1 100% gate.
  const [intPart, fracPart] = fixed.split('.');
  const symbol = CURRENCY_SYMBOL[currency.toUpperCase()] ?? `${currency.toUpperCase()} `;
  const sign = rounded.isNegative() && !rounded.isZero() ? '-' : '';
  return `${sign}${symbol}${groupThousands(intPart)}.${fracPart}`;
}
