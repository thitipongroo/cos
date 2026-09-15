// Unit tests — CentralPriceCatalogService, the tenant-facing catalog reads (ADR-061).

import { Prisma } from '@prisma/client';
import { CentralPriceCatalogService } from '../central-price-catalog.service';
import { encodeCatalogCursor } from '../central-price-cursor';
import type { CatalogDbRow } from '../central-price-queries';
import type { TenantPrismaService } from '../../tenant/prisma/tenant-prisma.service';

const tx = { $queryRaw: jest.fn() };
const db = { run: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)) };

function row(code: string, id: string): CatalogDbRow {
  return {
    price_id: id,
    code,
    description: 'd',
    category: null,
    unit: 'm3',
    central_price: '2450.0000',
    currency_code: 'THB',
    effective_period: '2569',
    source: 'MANUAL_IMPORT',
    source_ref: null,
    published_at: new Date('2026-09-15T00:00:00.000Z'),
    is_active: true,
  };
}

const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';

describe('CentralPriceCatalogService', () => {
  let svc: CentralPriceCatalogService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new CentralPriceCatalogService(db as unknown as TenantPrismaService);
  });

  describe('searchPublished', () => {
    it('runs in the tenant transaction, published rows only, and pages with limit + 1', async () => {
      tx.$queryRaw.mockResolvedValue([row('A', ID1), row('B', ID2)]);

      const result = await svc.searchPublished({ q: 'con', limit: 1 });

      expect(db.run).toHaveBeenCalledTimes(1);
      const sql = tx.$queryRaw.mock.calls[0][0] as Prisma.Sql;
      expect(sql.sql).toContain('c.is_active AND c.published_at IS NOT NULL');
      expect(sql.sql).toContain('LIMIT');
      expect(sql.values).toContain(2); // limit + 1
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({ code: 'A', status: 'ACTIVE' });
      expect(result.next_cursor).toBe(
        encodeCatalogCursor({ code: 'A', effective_period: '2569', price_id: ID1 }),
      );
    });

    it('returns no cursor on the last page and honours an incoming cursor and code', async () => {
      tx.$queryRaw.mockResolvedValue([row('B', ID2)]);
      const cursor = encodeCatalogCursor({ code: 'A', effective_period: '2569', price_id: ID1 });

      const result = await svc.searchPublished({ code: 'B', cursor });

      const sql = tx.$queryRaw.mock.calls[0][0] as Prisma.Sql;
      expect(sql.values).toEqual(expect.arrayContaining(['B', 'A', ID1, 51]));
      expect(result.next_cursor).toBeNull();
    });

    it('returns an empty page without a cursor', async () => {
      tx.$queryRaw.mockResolvedValue([]);
      await expect(svc.searchPublished({})).resolves.toEqual({ rows: [], next_cursor: null });
    });

    it('rejects a forged cursor before touching the database', async () => {
      await expect(svc.searchPublished({ cursor: 'nope' })).rejects.toMatchObject({ status: 400 });
      expect(db.run).not.toHaveBeenCalled();
    });
  });

  describe('findReferencePrice', () => {
    it('returns the newest active published row for the code', async () => {
      const ref = {
        price_id: ID1,
        code: 'A',
        unit: 'm3',
        central_price: '2450.0000',
        currency_code: 'THB',
        effective_period: '2569',
      };
      tx.$queryRaw.mockResolvedValue([ref]);

      await expect(svc.findReferencePrice('A')).resolves.toEqual(ref);

      const [strings, ...values] = tx.$queryRaw.mock.calls[0] as [string[], ...unknown[]];
      const text = strings.join('?');
      expect(text).toContain('c.is_active');
      expect(text).toContain('c.published_at IS NOT NULL');
      expect(text).toMatch(/ORDER BY c\.effective_period COLLATE "C" DESC, c\.published_at DESC/);
      expect(values).toEqual(['A']);
    });

    it('returns null when nothing matches', async () => {
      tx.$queryRaw.mockResolvedValue([]);
      await expect(svc.findReferencePrice('missing')).resolves.toBeNull();
    });
  });
});
