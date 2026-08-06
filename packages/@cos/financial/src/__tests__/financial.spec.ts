// Unit tests for @cos/financial — QM-1: mutation testing required for financial logic
// All monetary calculations must use HALF_UP rounding per FINANCIAL PRECISION SPEC

import { Decimal } from 'decimal.js';
import {
  calculateLineTotal,
  convertCurrency,
  sumDecimals,
  formatForDisplay,
  formatMoney,
  toDecimal,
} from '../index';

describe('calculateLineTotal', () => {
  it('multiplies quantity × unit_price and rounds to 4dp HALF_UP', () => {
    const result = calculateLineTotal(new Decimal('3'), new Decimal('1.23456789'));
    expect(result.toFixed(4)).toBe('3.7037'); // 3 × 1.23456789 = 3.70370367 → 3.7037
  });

  it('classic float trap: 0.1 + 0.2 precision', () => {
    // Native JS: 0.1 * 2 = 0.2 but floating point can drift
    const result = calculateLineTotal(new Decimal('0.1'), new Decimal('2'));
    expect(result.toFixed(4)).toBe('0.2000');
  });

  it('rounds UP at the 5th decimal (HALF_UP)', () => {
    // 1.000050000 → 1.0001 (round up)
    const result = calculateLineTotal(new Decimal('1'), new Decimal('1.000050000'));
    expect(result.toFixed(4)).toBe('1.0001');
  });

  it('rounds DOWN when 5th decimal < 5', () => {
    // 1.000049999 → 1.0000 (round down)
    const result = calculateLineTotal(new Decimal('1'), new Decimal('1.000049999'));
    expect(result.toFixed(4)).toBe('1.0000');
  });

  it('handles zero quantity', () => {
    const result = calculateLineTotal(new Decimal('0'), new Decimal('999.9999'));
    expect(result.toFixed(4)).toBe('0.0000');
  });

  it('handles large amounts (19,4 precision range)', () => {
    const result = calculateLineTotal(new Decimal('999999999999999'), new Decimal('1.0001'));
    expect(result.decimalPlaces()).toBeLessThanOrEqual(4);
  });
});

describe('convertCurrency', () => {
  it('multiplies amount × exchange rate to 4dp HALF_UP', () => {
    const result = convertCurrency(new Decimal('100'), new Decimal('33.123456'));
    expect(result.toFixed(4)).toBe('3312.3456');
  });

  it('handles THB → USD conversion', () => {
    const result = convertCurrency(new Decimal('1000'), new Decimal('0.027900'));
    expect(result.toFixed(4)).toBe('27.9000');
  });

  it('rounds 4dp HALF_UP correctly', () => {
    // 100 × 0.123456 = 12.3456 exactly
    const result = convertCurrency(new Decimal('100'), new Decimal('0.123456'));
    expect(result.toFixed(4)).toBe('12.3456');
  });
});

describe('sumDecimals', () => {
  it('sums array of Decimals correctly', () => {
    const values = [new Decimal('1.1111'), new Decimal('2.2222'), new Decimal('3.3333')];
    const result = sumDecimals(values);
    expect(result.toFixed(4)).toBe('6.6666');
  });

  it('returns zero for empty array', () => {
    expect(sumDecimals([]).toFixed(4)).toBe('0.0000');
  });

  it('handles negative values', () => {
    const values = [new Decimal('100'), new Decimal('-50.5000')];
    expect(sumDecimals(values).toFixed(4)).toBe('49.5000');
  });

  it('does not lose precision with many small values', () => {
    const values = Array.from({ length: 100 }, () => new Decimal('0.0001'));
    expect(sumDecimals(values).toFixed(4)).toBe('0.0100');
  });
});

describe('formatForDisplay', () => {
  it('formats to 2 decimal places for display', () => {
    expect(formatForDisplay(new Decimal('1234.5678'))).toBe('1234.57'); // HALF_UP
  });

  it('rounds 2.345 → 2.35 (HALF_UP)', () => {
    expect(formatForDisplay(new Decimal('2.345'))).toBe('2.35');
  });

  it('formats zero correctly', () => {
    expect(formatForDisplay(new Decimal('0'))).toBe('0.00');
  });

  it('formats integer as .00', () => {
    expect(formatForDisplay(new Decimal('1000'))).toBe('1000.00');
  });
});

describe('toDecimal', () => {
  it('converts string to Decimal', () => {
    const d = toDecimal('123.4567');
    expect(d instanceof Decimal).toBe(true);
    expect(d.toFixed(4)).toBe('123.4567');
  });

  it('converts number to Decimal', () => {
    const d = toDecimal(42);
    expect(d.toFixed(0)).toBe('42');
  });

  it('preserves precision from string (avoids float loss)', () => {
    // 0.1 as native JS float has representation error
    // toDecimal('0.1') from string preserves exact value
    const d = toDecimal('0.1');
    expect(d.plus(toDecimal('0.2')).toFixed(1)).toBe('0.3');
  });
});

describe('formatMoney', () => {
  it('renders THB exactly as DESIGN.md §9.5 specifies', () => {
    expect(formatMoney(toDecimal('1234567.89'))).toBe('฿1,234,567.89');
  });

  it('always shows two decimals, even on whole amounts', () => {
    // §9.5: "display 2 decimal places". A price that renders as ฿1,200 and one that renders as
    // ฿1,200.00 look like different degrees of precision to a reader approving a payment.
    expect(formatMoney(toDecimal('1200'))).toBe('฿1,200.00');
    expect(formatMoney(toDecimal('0'))).toBe('฿0.00');
  });

  it('rounds HALF_UP from the stored 4 decimal places', () => {
    // Storage is DECIMAL(19,4); display is 2. The rounding is the same commercial rounding the rest
    // of this module uses, so the figure shown is the figure stored, correctly rounded.
    expect(formatMoney(toDecimal('10.005'))).toBe('฿10.01');
    expect(formatMoney(toDecimal('10.0049'))).toBe('฿10.00');
  });

  it('groups thousands without depending on the device locale', () => {
    // Deliberately not Intl/toLocaleString: that would render 1.234,56 on a German handset and
    // degrade silently on Android builds with trimmed ICU. One presentation, everywhere.
    expect(formatMoney(toDecimal('999'))).toBe('฿999.00');
    expect(formatMoney(toDecimal('1000'))).toBe('฿1,000.00');
    expect(formatMoney(toDecimal('1000000000'))).toBe('฿1,000,000,000.00');
  });

  it('puts the sign before the symbol for credits and reversals', () => {
    expect(formatMoney(toDecimal('-1200'))).toBe('-฿1,200.00');
  });

  it('does not render a negative zero', () => {
    expect(formatMoney(toDecimal('-0.001'))).toBe('฿0.00');
  });

  it('accepts a string or number as well as a Decimal', () => {
    expect(formatMoney('1234.5')).toBe('฿1,234.50');
    expect(formatMoney(1234.5)).toBe('฿1,234.50');
  });

  it('uses the ISO 4217 symbol for the currencies the platform handles', () => {
    expect(formatMoney(toDecimal('1234.5'), 'USD')).toBe('$1,234.50');
    expect(formatMoney(toDecimal('1234.5'), 'sgd')).toBe('S$1,234.50');
  });

  it('prints an unknown code rather than inventing a glyph', () => {
    // An unrecognised currency is shown unambiguously. Guessing a symbol would put the wrong
    // currency in front of a real number.
    expect(formatMoney(toDecimal('1234.5'), 'XAF')).toBe('XAF 1,234.50');
  });
});
