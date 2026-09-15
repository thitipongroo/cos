// Unit tests — central price row validation (ADR-061). Pure.

import {
  centralPriceStatus,
  DEFAULT_CURRENCY,
  EFFECTIVE_PERIOD_RE,
  MAX_DATA_ROWS,
  SOURCE_FOR_KIND,
  TEMPLATE_COLUMNS,
  validateCentralPriceRecord,
  validateCentralPriceRecords,
  validateCentralPriceTable,
} from '../central-price-rows';

const HEADER = [...TEMPLATE_COLUMNS];

describe('validateCentralPriceRecord', () => {
  const good = {
    code: ' STR-001 ',
    description: ' คอนกรีตผสมเสร็จ 240 ksc ',
    category: ' งานโครงสร้าง ',
    unit: ' ลบ.ม. ',
    central_price: ' 2450.5 ',
    currency_code: 'THB',
  };

  it('trims text and normalises the price to four decimals with decimal.js', () => {
    expect(validateCentralPriceRecord(good)).toEqual({
      ok: true,
      row: {
        code: 'STR-001',
        description: 'คอนกรีตผสมเสร็จ 240 ksc',
        category: 'งานโครงสร้าง',
        unit: 'ลบ.ม.',
        central_price: '2450.5000',
        currency_code: 'THB',
      },
    });
  });

  it('defaults currency to THB and a blank category to null', () => {
    const result = validateCentralPriceRecord({ ...good, category: '  ', currency_code: null });
    expect(result).toMatchObject({
      ok: true,
      row: { category: null, currency_code: DEFAULT_CURRENCY },
    });
    expect(
      validateCentralPriceRecord({ ...good, category: undefined, currency_code: undefined }),
    ).toMatchObject({
      ok: true,
      row: { category: null, currency_code: 'THB' },
    });
  });

  it('keeps the largest DECIMAL(19,4) price and zero exactly', () => {
    expect(
      validateCentralPriceRecord({ ...good, central_price: '999999999999999.9999' }),
    ).toMatchObject({
      row: { central_price: '999999999999999.9999' },
    });
    expect(validateCentralPriceRecord({ ...good, central_price: '0' })).toMatchObject({
      row: { central_price: '0.0000' },
    });
  });

  it.each([
    [{ code: '' }, 'code is required'],
    [{ code: 'x'.repeat(101) }, 'code exceeds 100 characters'],
    [{ description: null }, 'description is required'],
    [{ description: 'x'.repeat(5001) }, 'description exceeds 5000 characters'],
    [{ unit: '' }, 'unit is required'],
    [{ unit: 'x'.repeat(51) }, 'unit exceeds 50 characters'],
    [{ category: 'x'.repeat(256) }, 'category exceeds 255 characters'],
    [{ central_price: '' }, 'central_price is required'],
    [{ currency_code: 'thb' }, 'currency_code must be a 3-letter ISO 4217 code'],
  ])('rejects %p with "%s"', (override, reason) => {
    expect(validateCentralPriceRecord({ ...good, ...override })).toEqual({ ok: false, reason });
  });

  it.each(['-1', '+1', '1e3', '1,000', '1.23456', '1234567890123456', 'abc', '.5', '1.'])(
    'rejects the price %p rather than guessing or rounding',
    (price) => {
      expect(validateCentralPriceRecord({ ...good, central_price: price })).toEqual({
        ok: false,
        reason:
          'central_price must be a non-negative decimal with at most 15 integer digits and 4 decimal places',
      });
    },
  );
});

describe('validateCentralPriceRecords', () => {
  it('keeps the first occurrence of a code and names it in the rejection of the next', () => {
    const base = { description: 'd', unit: 'u', central_price: '1' };
    const { valid, rejected } = validateCentralPriceRecords(
      [
        { ...base, code: 'A' },
        { ...base, code: 'B' },
        { ...base, code: 'A', central_price: '2' },
        { ...base, code: '' },
      ],
      [2, 3, 4, 5],
    );
    expect(valid.map((v) => v.code)).toEqual(['A', 'B']);
    expect(valid[0]!.central_price).toBe('1.0000');
    expect(rejected).toEqual([
      { row: 4, reason: 'duplicate code "A" (first on row 2)' },
      { row: 5, reason: 'code is required' },
    ]);
  });
});

describe('validateCentralPriceTable', () => {
  it('refuses an empty file and a blank header row', () => {
    expect(validateCentralPriceTable([])).toMatchObject({ ok: false, error_code: 'EMPTY_FILE' });
    expect(validateCentralPriceTable([[null, '  ']])).toMatchObject({
      ok: false,
      error_code: 'EMPTY_FILE',
    });
  });

  it('names every missing required column', () => {
    expect(validateCentralPriceTable([['code', 'category']])).toEqual({
      ok: false,
      error_code: 'MISSING_COLUMNS',
      message: 'The header row is missing required columns: description, unit, central_price.',
    });
  });

  it('refuses a header with no data rows (blank rows do not count)', () => {
    expect(validateCentralPriceTable([HEADER, [null, '', null]])).toMatchObject({
      ok: false,
      error_code: 'NO_DATA_ROWS',
    });
  });

  it('refuses more than MAX_DATA_ROWS data rows', () => {
    const rows = Array.from({ length: MAX_DATA_ROWS + 1 }, (_, i) => [
      `C${i}`,
      'd',
      null,
      'u',
      '1',
      null,
    ]);
    expect(validateCentralPriceTable([HEADER, ...rows])).toMatchObject({
      ok: false,
      error_code: 'TOO_MANY_ROWS',
    });
  });

  it('matches headers case-insensitively in any order, ignores extra columns, reports spreadsheet row numbers', () => {
    const table = [
      [' Unit ', 'NOTES', 'central_price', 'Code', 'description', 'code'],
      ['m3', 'ignored', '100', 'A', 'Concrete', 'shadowed'],
      [null, null, null, null, null, null], // blank row 3 — skipped, not counted
      ['kg', 'x', 'bad', 'B'], // short row: the missing description cell reads as absent
    ];
    const result = validateCentralPriceTable(table);
    expect(result).toEqual({
      ok: true,
      total: 2,
      valid: [
        {
          code: 'A',
          description: 'Concrete',
          category: null,
          unit: 'm3',
          central_price: '100.0000',
          currency_code: 'THB',
        },
      ],
      rejected: [{ row: 4, reason: 'description is required' }],
    });
  });
});

describe('centralPriceStatus', () => {
  it('INACTIVE wins, then PENDING while unpublished, else ACTIVE', () => {
    expect(centralPriceStatus(false, new Date())).toBe('INACTIVE');
    expect(centralPriceStatus(true, null)).toBe('PENDING');
    expect(centralPriceStatus(true, new Date())).toBe('ACTIVE');
  });
});

describe('constants', () => {
  it('maps sync kinds to ADR-061 sources', () => {
    expect(SOURCE_FOR_KIND).toEqual({ FILE_IMPORT: 'MANUAL_IMPORT', GOV_API: 'GOV_API' });
  });

  it.each([
    ['2569', true],
    ['2569-01', true],
    ['2026/Q3', true],
    ['v1.2_a', true],
    ['', false],
    [' 2569', false],
    ['2569 ', false],
    ['-2569', false],
    ['x'.repeat(33), false],
  ])('EFFECTIVE_PERIOD_RE %p → %p', (value, ok) => {
    expect(EFFECTIVE_PERIOD_RE.test(value)).toBe(ok);
  });
});
