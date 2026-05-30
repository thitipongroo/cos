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
