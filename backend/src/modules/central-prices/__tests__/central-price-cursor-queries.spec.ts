// Unit tests — keyset cursor, shared SQL builders and row mappers (ADR-061).

import { Prisma } from '@prisma/client';
import { decodeCatalogCursor, encodeCatalogCursor } from '../central-price-cursor';
import {
  afterCursor,
  catalogWhere,
  escapeLike,
  pageSize,
  PAGE_DEFAULT,
  PAGE_MAX,
  toCentralPriceRow,
  toSyncRun,
  type CatalogDbRow,
} from '../central-price-queries';

const PRICE_ID = '11111111-1111-4111-8111-111111111111';

describe('catalog cursor', () => {
  it('round-trips the three keys, Thai text included', () => {
    const key = { code: 'คอนกรีต-01', effective_period: '2569', price_id: PRICE_ID };
    expect(decodeCatalogCursor(encodeCatalogCursor(key))).toEqual(key);
  });

  it.each([
    ['not base64 json', '!!!'],
    ['an object', Buffer.from('{"a":1}').toString('base64url')],
    ['two keys', Buffer.from('["a","b"]').toString('base64url')],
    ['a number key', Buffer.from(`["a",1,"${PRICE_ID}"]`).toString('base64url')],
    ['a non-uuid id', Buffer.from('["a","b","c"]').toString('base64url')],
  ])('rejects %s with COS-CPRICE-005', (_label, cursor) => {
    expect(() => decodeCatalogCursor(cursor)).toThrow(
      expect.objectContaining({
        status: 400,
        response: { error: expect.objectContaining({ code: 'COS-CPRICE-005' }) },
      }),
    );
  });
});

function sqlText(sql: Prisma.Sql): string {
  return sql.strings.join('?');
}

describe('catalogWhere', () => {
  it('is TRUE alone with no filters', () => {
    const sql = catalogWhere({});
    expect(sqlText(sql)).toBe('TRUE');
    expect(sql.values).toEqual([]);
  });

  it('binds every filter as a parameter and restricts to published rows on request', () => {
    const sql = catalogWhere({
      q: '10%_off\\',
      code: 'A',
      category: 'งาน',
      effective_period: '2569',
      publishedOnly: true,
    });
    const text = sqlText(sql);
    expect(text).toContain('c.is_active AND c.published_at IS NOT NULL');
    expect(text).toContain('c.code = ?');
    expect(text).toContain('c.category = ?');
    expect(text).toContain('c.effective_period = ?');
    expect(text).toContain('(c.code ILIKE ? OR c.description ILIKE ?)');
    expect(sql.values).toEqual(['A', 'งาน', '2569', '%10\\%\\_off\\\\%', '%10\\%\\_off\\\\%']);
  });
});

describe('escapeLike / afterCursor / pageSize', () => {
  it('escapes LIKE metacharacters', () => {
    expect(escapeLike('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
  });

  it('afterCursor is TRUE without a cursor and a byte-order keyset predicate with one', () => {
    expect(sqlText(afterCursor(undefined))).toBe('TRUE');
    const sql = afterCursor({ code: 'A', effective_period: '2569', price_id: PRICE_ID });
    expect(sqlText(sql)).toContain('COLLATE "C"');
    expect(sql.values).toEqual(['A', 'A', '2569', '2569', PRICE_ID]);
  });

  it('pageSize defaults, clamps and truncates', () => {
    expect(pageSize(undefined)).toBe(PAGE_DEFAULT);
    expect(pageSize(0)).toBe(1);
    expect(pageSize(PAGE_MAX + 1)).toBe(PAGE_MAX);
    expect(pageSize(7.9)).toBe(7);
  });
});

describe('row mappers', () => {
  const dbRow: CatalogDbRow = {
    price_id: PRICE_ID,
    code: 'A',
    description: 'd',
    category: null,
    unit: 'u',
    central_price: '1.0000',
    currency_code: 'THB',
    effective_period: '2569',
    source: 'MANUAL_IMPORT',
    source_ref: null,
    published_at: new Date('2026-09-15T01:02:03.000Z'),
    is_active: true,
  };

  it('toCentralPriceRow serialises published_at and derives status', () => {
    expect(toCentralPriceRow(dbRow)).toMatchObject({
      published_at: '2026-09-15T01:02:03.000Z',
      status: 'ACTIVE',
    });
    expect(toCentralPriceRow({ ...dbRow, published_at: null })).toMatchObject({
      published_at: null,
      status: 'PENDING',
    });
  });

  it('toSyncRun serialises both timestamps', () => {
    const run = toSyncRun({
      run_id: PRICE_ID,
      kind: 'FILE_IMPORT',
      source_name: 'f.csv',
      effective_period: '2569',
      started_at: new Date('2026-09-15T00:00:00.000Z'),
      finished_at: new Date('2026-09-15T00:00:01.000Z'),
      outcome: 'SUCCEEDED',
      records_total: 1,
      records_inserted: 1,
      records_updated: 0,
      records_rejected: 0,
      error_code: null,
      error_message: null,
      actor_id: null,
    });
    expect(run.started_at).toBe('2026-09-15T00:00:00.000Z');
    expect(run.finished_at).toBe('2026-09-15T00:00:01.000Z');
  });
});
