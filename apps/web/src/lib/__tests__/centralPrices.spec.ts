import { EFFECTIVE_PERIOD_RE, IMPORT_MAX_BYTES, importErrorKey, priceText } from '../centralPrices';

describe('priceText', () => {
  it.each([
    ['24850.0000', '24,850.00'],
    ['115.0000', '115.00'],
    ['115.1250', '115.125'],
    ['0.0001', '0.0001'],
    ['1234567', '1,234,567.00'],
    ['-2050.5000', '-2,050.50'],
    ['999.9999', '999.9999'],
  ])('%s → %s', (value, text) => {
    expect(priceText(value)).toBe(text);
  });
  it('returns anything that is not a plain decimal unchanged', () => {
    expect(priceText('1e5')).toBe('1e5');
    expect(priceText('')).toBe('');
  });
});

describe('importErrorKey', () => {
  it.each([
    [400, 'admin.errors.invalid'],
    [403, 'admin.errors.forbidden'],
    [413, 'admin.centralPrices.error.fileTooLarge'],
    [415, 'admin.centralPrices.error.unsupportedFileType'],
    [422, 'admin.centralPrices.error.importFailed'],
    [500, 'admin.errors.generic'],
    [undefined, 'admin.errors.generic'],
  ])('%s → %s', (status, key) => {
    expect(importErrorKey(status)).toBe(key);
  });
});

describe('import rules', () => {
  it('caps a file at 5 MiB', () => {
    expect(IMPORT_MAX_BYTES).toBe(5242880);
  });
  it('matches the backend period rule', () => {
    expect(EFFECTIVE_PERIOD_RE.test('2569')).toBe(true);
    expect(EFFECTIVE_PERIOD_RE.test('Q3/2026')).toBe(true);
    expect(EFFECTIVE_PERIOD_RE.test('-2569')).toBe(false);
    expect(EFFECTIVE_PERIOD_RE.test('a'.repeat(33))).toBe(false);
  });
});
