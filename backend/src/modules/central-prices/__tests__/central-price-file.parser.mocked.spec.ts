// Unit tests — the central price file reader's defensive branches, with both libraries replaced.
// The real libraries are exercised in central-price-file.parser.spec.ts; these cases are ones they do
// not produce on demand: a parser error without a code, and cell values that are Dates or booleans.

jest.mock('csv-parse/sync', () => ({
  parse: jest.fn(() => {
    throw new Error('no code on this error');
  }),
}));

jest.mock('read-excel-file/node', () => ({
  readSheet: jest.fn(async () => [
    [new Date('2026-09-15T00:00:00.000Z'), true, 42, undefined, null],
  ]),
}));

import { readCentralPriceTable } from '../central-price-file.parser';

describe('readCentralPriceTable — defensive branches', () => {
  it('names a generic code when the CSV parser error has none', async () => {
    await expect(readCentralPriceTable('csv', Buffer.from('x'))).rejects.toMatchObject({
      code: 'FILE_UNREADABLE',
      message: 'The CSV file could not be parsed (CSV_PARSE_ERROR).',
    });
  });

  it('turns every cell into text or null — Dates as ISO 8601', async () => {
    await expect(readCentralPriceTable('xlsx', Buffer.from('PK'))).resolves.toEqual([
      ['2026-09-15T00:00:00.000Z', 'true', '42', null, null],
    ]);
  });
});
