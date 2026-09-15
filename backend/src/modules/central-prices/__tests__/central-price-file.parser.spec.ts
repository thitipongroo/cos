// Unit tests — central price file reading (ADR-061). Real csv-parse and read-excel-file, no mocks: the
// point is that the libraries hand back text the validator can trust, prices included.

import { buildXlsx } from '../../../../test/helpers/xlsx-fixture';
import {
  CentralPriceFileError,
  detectFileKind,
  readCentralPriceTable,
} from '../central-price-file.parser';

const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);
const TEXT = Buffer.from('code,description\r\n');

describe('detectFileKind', () => {
  it.each([
    ['prices.csv', TEXT, 'csv'],
    ['PRICES.CSV', TEXT, 'csv'],
    ['prices.xlsx', ZIP, 'xlsx'],
    ['prices.XLSX', ZIP, 'xlsx'],
    ['prices.csv', ZIP, null], // a workbook renamed to .csv
    ['prices.xlsx', TEXT, null], // text renamed to .xlsx
    ['prices.xls', ZIP, null], // legacy BIFF is not supported
    ['prices', TEXT, null],
    ['prices.txt', TEXT, null],
  ])('%s → %p', (name, bytes, kind) => {
    expect(detectFileKind(name, bytes)).toBe(kind);
  });
});

describe('readCentralPriceTable — CSV', () => {
  it('reads UTF-8 with a BOM, quoted commas, empty cells as null, ragged rows kept', async () => {
    const csv = '﻿code,description,unit\r\nSTR-001,"คอนกรีต, 240 ksc",ลบ.ม.\r\nB,,kg,extra\r\n';
    await expect(readCentralPriceTable('csv', Buffer.from(csv, 'utf8'))).resolves.toEqual([
      ['code', 'description', 'unit'],
      ['STR-001', 'คอนกรีต, 240 ksc', 'ลบ.ม.'],
      ['B', null, 'kg', 'extra'],
    ]);
  });

  it('refuses a file that is not UTF-8 (e.g. Windows-874 Thai) with CSV_NOT_UTF8', async () => {
    const tis620 = Buffer.from([0x63, 0x6f, 0x64, 0x65, 0x0a, 0xa1, 0xd2, 0xc3]); // "code\nการ" in TIS-620
    await expect(readCentralPriceTable('csv', tis620)).rejects.toMatchObject({
      name: 'CentralPriceFileError',
      code: 'CSV_NOT_UTF8',
    });
  });

  it('reports an unparseable CSV with the parser error code', async () => {
    const err = await readCentralPriceTable('csv', Buffer.from('a,"b\nc')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CentralPriceFileError);
    expect(err).toMatchObject({
      code: 'FILE_UNREADABLE',
      message: 'The CSV file could not be parsed (CSV_QUOTE_NOT_CLOSED).',
    });
  });
});

describe('readCentralPriceTable — xlsx', () => {
  it('reads the first sheet, keeping numbers as the text the workbook stored', async () => {
    const bytes = await buildXlsx([
      ['code', 'description', 'category', 'unit', 'central_price', 'currency_code'],
      ['STR-001', 'คอนกรีต 240 ksc', 'งานโครงสร้าง', 'ลบ.ม.', { number: '2450.1234' }, 'THB'],
      ['STR-002', 'Rebar', null, 'kg', { number: '0.1' }, null],
    ]);
    const table = await readCentralPriceTable('xlsx', bytes);
    expect(table[1]).toEqual([
      'STR-001',
      'คอนกรีต 240 ksc',
      'งานโครงสร้าง',
      'ลบ.ม.',
      '2450.1234',
      'THB',
    ]);
    // 0.1 must arrive as "0.1", never as the float 0.1.
    expect(table[2]).toEqual(['STR-002', 'Rebar', null, 'kg', '0.1', null]);
  });

  it('refuses bytes that are a ZIP but not a workbook', async () => {
    await expect(readCentralPriceTable('xlsx', ZIP)).rejects.toMatchObject({
      code: 'FILE_UNREADABLE',
    });
  });
});
