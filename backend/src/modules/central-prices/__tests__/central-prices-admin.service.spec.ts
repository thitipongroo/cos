// Unit tests — CentralPricesAdminService: register reads, file import, adapter sync (ADR-061; D8, D9).
// The database is a double; the SQL shape and the transaction boundaries are what is asserted. The same
// flows run against PostgreSQL in test/central-prices/01-central-prices.integration.spec.ts.

const mockTx = {
  $queryRaw: jest.fn(),
  $executeRaw: jest.fn(),
  $executeRawUnsafe: jest.fn(),
};
const mockPrisma = {
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
  $disconnect: jest.fn(),
};

jest.mock('../../../shared/prisma/create-prisma-client', () => ({
  createPrismaClient: jest.fn(() => mockPrisma),
}));
jest.mock('@cos/kafka', () => ({ OutboxPublisher: { write: jest.fn() } }));
jest.mock('../central-price-file.parser', () => {
  const actual = jest.requireActual('../central-price-file.parser');
  return { ...actual, readCentralPriceTable: jest.fn(actual.readCentralPriceTable) };
});

import { UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OutboxPublisher } from '@cos/kafka';
import type {
  CentralPriceAdapter,
  CentralPriceFetchResult,
} from '../adapters/central-price-adapter';
import { encodeCatalogCursor } from '../central-price-cursor';
import { readCentralPriceTable } from '../central-price-file.parser';
import type { CatalogDbRow, SyncRunDbRow } from '../central-price-queries';
import { CATALOG_UPDATED_EVENT, CentralPricesAdminService } from '../central-prices-admin.service';

const TENANT = 'aaaaaaaa-0000-4000-8000-000000000001';
const ACTOR = 'aaaaaaaa-0000-4000-8000-000000000002';
const RUN_ID = 'aaaaaaaa-0000-4000-8000-000000000003';
const PRICE_ID = 'aaaaaaaa-0000-4000-8000-000000000004';
const caller = { actorId: ACTOR, tenantId: TENANT };
const JUSTIFICATION = 'Comptroller General circular for 2569 published';

const HEADER = 'code,description,category,unit,central_price,currency_code';

function csv(...lines: string[]): Buffer {
  return Buffer.from([HEADER, ...lines].join('\r\n'), 'utf8');
}

function sqlOf(call: unknown[]): string {
  const first = call[0] as { sql?: string } | string[];
  if (!Array.isArray(first) && typeof first.sql === 'string') return first.sql;
  return (first as string[]).join('?');
}

/** Answers the two tx.$queryRaw shapes: the existing-code count, and INSERT … RETURNING the run. */
function primeTx(existing = 0): void {
  mockTx.$queryRaw.mockImplementation(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('?');
      if (text.includes('count(*)')) return [{ count: existing }];
      if (text.includes('INSERT INTO platform.central_price_sync_runs')) {
        const [
          kind,
          source_name,
          effective_period,
          started_at,
          finishedFloor,
          outcome,
          total,
          ins,
          upd,
          rej,
          code,
          msg,
          actor,
        ] = values;
        // finished_at is GREATEST(now(), started_at): the floor bound is started_at itself.
        expect(finishedFloor).toBe(started_at);
        const run: SyncRunDbRow = {
          run_id: RUN_ID,
          kind: kind as SyncRunDbRow['kind'],
          source_name: source_name as string,
          effective_period: effective_period as string | null,
          started_at: new Date(started_at as string),
          finished_at: new Date(started_at as string),
          outcome: outcome as SyncRunDbRow['outcome'],
          records_total: total as number,
          records_inserted: ins as number,
          records_updated: upd as number,
          records_rejected: rej as number,
          error_code: code as string | null,
          error_message: msg as string | null,
          actor_id: actor as string,
        };
        return [run];
      }
      throw new Error(`unexpected query: ${text}`);
    },
  );
  mockTx.$executeRaw.mockResolvedValue(1);
  mockTx.$executeRawUnsafe.mockResolvedValue(0);
}

function adapter(
  result: CentralPriceFetchResult | (() => Promise<CentralPriceFetchResult>),
): CentralPriceAdapter {
  return {
    name: 'test-adapter',
    isConfigured: () => true,
    fetch: jest.fn(typeof result === 'function' ? result : async () => result),
  };
}

function auditMetadata(): Record<string, unknown> {
  const call = mockTx.$executeRaw.mock.calls.find((c) =>
    (c[0] as string[]).join('?').includes('INSERT INTO platform.audit_logs'),
  )!;
  const values = call.slice(1);
  return JSON.parse(values[values.length - 1] as string) as Record<string, unknown>;
}

function auditCall(): unknown[] {
  return mockTx.$executeRaw.mock.calls.find((c) =>
    (c[0] as string[]).join('?').includes('INSERT INTO platform.audit_logs'),
  )!;
}

describe('CentralPricesAdminService', () => {
  let svc: CentralPricesAdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockTx) => unknown) =>
      fn(mockTx),
    );
    primeTx();
    svc = new CentralPricesAdminService(adapter({ outcome: 'NOT_CONFIGURED', message: 'n/a' }));
  });

  it('closes its client on shutdown (Rule 39)', async () => {
    await svc.onModuleDestroy();
    expect(mockPrisma.$disconnect).toHaveBeenCalledTimes(1);
  });

  // ── list ─────────────────────────────────────────────────────────────────

  describe('list', () => {
    const dbRow = (code: string): CatalogDbRow => ({
      price_id: PRICE_ID,
      code,
      description: 'd',
      category: 'งานโครงสร้าง',
      unit: 'm3',
      central_price: '1.0000',
      currency_code: 'THB',
      effective_period: '2569',
      source: 'MANUAL_IMPORT',
      source_ref: null,
      published_at: null,
      is_active: true,
    });

    it('returns a page, the filtered total, the next cursor and every period', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([dbRow('A'), dbRow('B')])
        .mockResolvedValueOnce([{ total: 7 }])
        .mockResolvedValueOnce([{ effective_period: '2569' }, { effective_period: '2568' }]);

      const result = await svc.list({
        q: 'x',
        category: 'งานโครงสร้าง',
        effective_period: '2569',
        limit: 1,
      });

      expect(result).toEqual({
        rows: [expect.objectContaining({ code: 'A', status: 'PENDING' })],
        total: 7,
        next_cursor: encodeCatalogCursor({
          code: 'A',
          effective_period: '2569',
          price_id: PRICE_ID,
        }),
        periods: ['2569', '2568'],
      });
      const pageSql = mockPrisma.$queryRaw.mock.calls[0][0] as Prisma.Sql;
      expect(pageSql.values).toEqual(expect.arrayContaining(['งานโครงสร้าง', '2569', '%x%', 2]));
      // Admin sees every status — no published-only restriction.
      expect(pageSql.sql).not.toContain('published_at IS NOT NULL');
    });

    it('applies an incoming cursor and returns no cursor on the last page', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([dbRow('B')])
        .mockResolvedValueOnce([{ total: 2 }])
        .mockResolvedValueOnce([]);
      const cursor = encodeCatalogCursor({
        code: 'A',
        effective_period: '2569',
        price_id: PRICE_ID,
      });

      const result = await svc.list({ cursor });

      expect((mockPrisma.$queryRaw.mock.calls[0][0] as Prisma.Sql).values).toEqual(
        expect.arrayContaining(['A', PRICE_ID, 51]),
      );
      expect(result.next_cursor).toBeNull();
      expect(result.periods).toEqual([]);
    });
  });

  // ── sync-status ──────────────────────────────────────────────────────────

  describe('syncStatus', () => {
    it('reports the adapter and the latest run, success and failure', async () => {
      const run: SyncRunDbRow = {
        run_id: RUN_ID,
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
        actor_id: ACTOR,
      };
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([run])
        .mockResolvedValueOnce([run])
        .mockResolvedValueOnce([]);

      const status = await svc.syncStatus();

      expect(status).toEqual({
        adapter: { name: 'test-adapter', configured: true },
        last_run: expect.objectContaining({
          run_id: RUN_ID,
          started_at: '2026-09-15T00:00:00.000Z',
        }),
        last_success: expect.objectContaining({ outcome: 'SUCCEEDED' }),
        last_failure: null,
      });
      const conditions = mockPrisma.$queryRaw.mock.calls.map((c) => (c[0] as Prisma.Sql).sql);
      expect(conditions[1]).toContain("outcome = 'SUCCEEDED'");
      expect(conditions[2]).toContain("outcome = 'FAILED'");
    });
  });

  // ── import ───────────────────────────────────────────────────────────────

  describe('importFile', () => {
    const request = (
      bytes: Buffer,
      filename = 'ราคากลาง-2569.csv',
      source_ref: string | null = 'ว 123',
    ) => ({
      justification: JUSTIFICATION,
      effective_period: '2569',
      source_ref,
      file: { filename, bytes },
    });

    it('refuses a caller tenant id that is not a UUID before anything else', async () => {
      await expect(
        svc.importFile({ ...caller, tenantId: "x'; DROP" }, request(csv())),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('415 for a file that is neither CSV nor xlsx — and records nothing', async () => {
      await expect(svc.importFile(caller, request(csv(), 'prices.pdf'))).rejects.toMatchObject({
        status: 415,
      });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('writes rows, run, audit and event in ONE transaction and reports the counts', async () => {
      primeTx(1); // one of the two codes already exists for 2569

      const result = await svc.importFile(
        caller,
        request(
          csv(
            'STR-001,คอนกรีต 240 ksc,งานโครงสร้าง,ลบ.ม.,2450.5,THB',
            'STR-002,Rebar,,kg,28,',
            'STR-003,Bad price,,kg,-1,THB',
          ),
        ),
      );

      expect(result).toEqual({
        run_id: RUN_ID,
        outcome: 'SUCCEEDED',
        records_total: 3,
        inserted: 1,
        updated: 1,
        rejected: [
          {
            row: 4,
            reason:
              'central_price must be a non-negative decimal with at most 15 integer digits and 4 decimal places',
          },
        ],
      });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$transaction.mock.calls[0][1]).toEqual({ timeout: 60_000 });

      const executed = mockTx.$executeRaw.mock.calls.map(sqlOf);
      expect(executed[0]).toContain('pg_advisory_xact_lock');
      expect(mockTx.$executeRaw.mock.calls[0]).toContain('central_price_catalog:2569');
      expect(executed[1]).toContain('ON CONFLICT (code, effective_period) DO UPDATE');
      const upsertValues = mockTx.$executeRaw.mock.calls[1].slice(1);
      expect(upsertValues).toEqual(
        expect.arrayContaining([
          ['STR-001', 'STR-002'],
          ['งานโครงสร้าง', null],
          ['2450.5000', '28.0000'],
          ['THB', 'THB'],
          '2569',
          'MANUAL_IMPORT',
          'ว 123',
        ]),
      );

      // Audit: caller's tenant set LOCAL first, then the row with justification + counts.
      expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
        `SET LOCAL app.current_tenant_id = '${TENANT}'`,
      );
      expect(auditCall()).toEqual(
        expect.arrayContaining([TENANT, ACTOR, 'central_prices.import', RUN_ID]),
      );
      expect(auditMetadata()).toEqual({
        justification: JUSTIFICATION,
        effective_period: '2569',
        source_ref: 'ว 123',
        file_name: 'ราคากลาง-2569.csv',
        run_id: RUN_ID,
        outcome: 'SUCCEEDED',
        records_total: 3,
        records_inserted: 1,
        records_updated: 1,
        records_rejected: 1,
        error_code: null,
      });

      expect(OutboxPublisher.write).toHaveBeenCalledTimes(1);
      expect(OutboxPublisher.write).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          event_type: CATALOG_UPDATED_EVENT,
          tenant_id: 'platform',
          actor_id: ACTOR,
          payload: {
            run_id: RUN_ID,
            source: 'MANUAL_IMPORT',
            effective_period: '2569',
            records_inserted: 1,
            records_updated: 1,
          },
        }),
      );
    });

    it('splits a large import into 1,000-row statements', async () => {
      const lines = Array.from({ length: 1001 }, (_, i) => `C${i},d,,u,1,THB`);
      await svc.importFile(caller, request(csv(...lines), 'big.csv', null));
      const upserts = mockTx.$executeRaw.mock.calls.filter((c) => sqlOf(c).includes('ON CONFLICT'));
      expect(upserts).toHaveLength(2);
      // The first bound array is the chunk's codes: 1,000 in the first statement, the last 1 in the second.
      const codesOf = (call: unknown[]): string[] => call.slice(1).find(Array.isArray) as string[];
      expect(codesOf(upserts[0]!)).toHaveLength(1000);
      expect(codesOf(upserts[1]!)).toEqual(['C1000']);
    });

    it('all rows rejected: FAILED run NO_VALID_ROWS with its audit, no catalog write, no event, 200 body', async () => {
      const result = await svc.importFile(caller, request(csv(',no code,,u,1,THB')));

      expect(result).toMatchObject({
        outcome: 'FAILED',
        inserted: 0,
        updated: 0,
        records_total: 1,
      });
      expect(result.rejected).toEqual([{ row: 2, reason: 'code is required' }]);
      expect(mockTx.$executeRaw.mock.calls.map(sqlOf).some((s) => s.includes('ON CONFLICT'))).toBe(
        false,
      );
      expect(auditMetadata()).toMatchObject({ outcome: 'FAILED', error_code: 'NO_VALID_ROWS' });
      expect(OutboxPublisher.write).not.toHaveBeenCalled();
    });

    it('unreadable file: FAILED run + audit, then 422 COS-CPRICE-004 carrying the run id', async () => {
      const notUtf8 = Buffer.from([0x63, 0x6f, 0x64, 0x65, 0x0a, 0xa1, 0xd2]);
      await expect(svc.importFile(caller, request(notUtf8))).rejects.toMatchObject({
        status: 422,
        response: {
          error: { code: 'COS-CPRICE-004', details: { run_id: RUN_ID, reason: 'CSV_NOT_UTF8' } },
        },
      });
      expect(auditMetadata()).toMatchObject({ outcome: 'FAILED', error_code: 'CSV_NOT_UTF8' });
      expect(OutboxPublisher.write).not.toHaveBeenCalled();
    });

    it('missing columns: FAILED run, 422 naming the reason', async () => {
      await expect(
        svc.importFile(caller, request(Buffer.from('code,unit\r\nA,m3'))),
      ).rejects.toMatchObject({
        status: 422,
        response: { error: { details: { reason: 'MISSING_COLUMNS' } } },
      });
    });

    it('rethrows a reader failure that is not a file-content problem, recording nothing', async () => {
      const boom = new Error('out of memory');
      (readCentralPriceTable as jest.Mock).mockRejectedValueOnce(boom);
      await expect(svc.importFile(caller, request(csv('A,d,,u,1,THB')))).rejects.toBe(boom);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('database failure: records a FAILED WRITE_FAILED run separately, then rethrows', async () => {
      const dbError = new Error('deadlock detected');
      mockPrisma.$transaction
        .mockImplementationOnce(async () => {
          throw dbError;
        })
        .mockImplementationOnce(async (fn: (tx: typeof mockTx) => unknown) => fn(mockTx));

      await expect(svc.importFile(caller, request(csv('A,d,,u,1,THB')))).rejects.toBe(dbError);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
      expect(auditMetadata()).toMatchObject({ outcome: 'FAILED', error_code: 'WRITE_FAILED' });
    });

    it('database failure that cannot even be recorded still surfaces the original error', async () => {
      mockPrisma.$transaction
        .mockImplementationOnce(async () => {
          throw 'non-error rejection';
        })
        .mockImplementationOnce(async () => {
          throw 'recording failed too';
        });
      await expect(svc.importFile(caller, request(csv('A,d,,u,1,THB')))).rejects.toBe(
        'non-error rejection',
      );

      const recordError = new Error('recording failed');
      mockPrisma.$transaction
        .mockImplementationOnce(async () => {
          throw new Error('first');
        })
        .mockImplementationOnce(async () => {
          throw recordError;
        });
      await expect(svc.importFile(caller, request(csv('A,d,,u,1,THB')))).rejects.toThrow('first');
    });
  });

  // ── sync ─────────────────────────────────────────────────────────────────

  describe('sync', () => {
    it('refuses a non-UUID caller tenant', async () => {
      await expect(svc.sync({ ...caller, tenantId: 'nope' }, JUSTIFICATION)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('NOT_CONFIGURED: records the run honestly with its audit, writes nothing', async () => {
      const run = await svc.sync(caller, JUSTIFICATION);

      expect(run).toMatchObject({
        run_id: RUN_ID,
        kind: 'GOV_API',
        source_name: 'test-adapter',
        effective_period: null,
        outcome: 'NOT_CONFIGURED',
        error_code: 'ADAPTER_NOT_CONFIGURED',
        error_message: 'n/a',
      });
      expect(typeof run.started_at).toBe('string');
      expect(auditCall()).toEqual(expect.arrayContaining(['central_prices.sync']));
      expect(auditMetadata()).toMatchObject({ adapter: 'test-adapter', outcome: 'NOT_CONFIGURED' });
      expect(OutboxPublisher.write).not.toHaveBeenCalled();
    });

    it('FAILED: keeps the adapter code, cut to the column width', async () => {
      svc = new CentralPricesAdminService(
        adapter({ outcome: 'FAILED', error_code: 'E'.repeat(80), message: 'upstream 503' }),
      );
      const run = await svc.sync(caller, JUSTIFICATION);
      expect(run).toMatchObject({
        outcome: 'FAILED',
        error_code: 'E'.repeat(64),
        error_message: 'upstream 503',
      });
    });

    it.each([
      ['an Error', new Error('socket hang up')],
      ['a non-Error value', 'string rejection'],
    ])('an adapter that throws %s is recorded as FAILED ADAPTER_ERROR', async (_label, thrown) => {
      svc = new CentralPricesAdminService(
        adapter(async () => {
          throw thrown;
        }),
      );
      await expect(svc.sync(caller, JUSTIFICATION)).resolves.toMatchObject({
        outcome: 'FAILED',
        error_code: 'ADAPTER_ERROR',
      });
    });

    it('FETCHED with a period the catalog cannot store: FAILED INVALID_PERIOD, nothing written', async () => {
      svc = new CentralPricesAdminService(
        adapter({
          outcome: 'FETCHED',
          effective_period: 'bad period',
          source_ref: null,
          records: [{ code: 'A' }],
        }),
      );
      await expect(svc.sync(caller, JUSTIFICATION)).resolves.toMatchObject({
        outcome: 'FAILED',
        error_code: 'INVALID_PERIOD',
        records_total: 1,
        records_rejected: 1,
      });
      expect(OutboxPublisher.write).not.toHaveBeenCalled();
    });

    it('FETCHED: validates like a file and writes GOV_API rows with the event', async () => {
      svc = new CentralPricesAdminService(
        adapter({
          outcome: 'FETCHED',
          effective_period: '2569',
          source_ref: 'egp:2569',
          records: [
            { code: 'A', description: 'd', unit: 'u', central_price: '10' },
            { code: 'A', description: 'dup', unit: 'u', central_price: '11' },
          ],
        }),
      );
      const run = await svc.sync(caller, JUSTIFICATION);

      expect(run).toMatchObject({
        outcome: 'SUCCEEDED',
        effective_period: '2569',
        records_total: 2,
        records_inserted: 1,
        records_rejected: 1,
      });
      expect(mockTx.$executeRaw.mock.calls[1]).toEqual(
        expect.arrayContaining(['GOV_API', 'egp:2569']),
      );
      expect(OutboxPublisher.write).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({ payload: expect.objectContaining({ source: 'GOV_API' }) }),
      );
    });

    it('FETCHED with every record invalid: FAILED NO_VALID_ROWS', async () => {
      svc = new CentralPricesAdminService(
        adapter({
          outcome: 'FETCHED',
          effective_period: '2569',
          source_ref: null,
          records: [{ code: '' }],
        }),
      );
      await expect(svc.sync(caller, JUSTIFICATION)).resolves.toMatchObject({
        outcome: 'FAILED',
        error_code: 'NO_VALID_ROWS',
      });
    });
  });
});
