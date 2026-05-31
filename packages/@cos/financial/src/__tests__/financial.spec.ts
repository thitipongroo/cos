// Unit tests for @cos/financial — QM-1: mutation testing required for financial logic
// All monetary calculations must use HALF_UP rounding per FINANCIAL PRECISION SPEC

import { Decimal } from 'decimal.js';
import {
  calculateLineTotal,
  convertCurrency,
  sumDecimals,
  formatForDisplay,
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
