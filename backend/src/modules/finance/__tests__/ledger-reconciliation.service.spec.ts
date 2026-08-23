// LedgerReconciliationService — TDD OQ-31.
//
// What these tests are actually protecting: the job's whole value is that it says something when the
// event-derived ledger and its source disagree. Every failure mode here is a variant of "it ran, it
// found nothing, and it was wrong about that" — which is indistinguishable from a healthy system
// unless a test pins it down.

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: mockInfo, warn: jest.fn(), error: mockError, debug: jest.fn() }),
}));

jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
}));

// The gauge callback is registered in the constructor; capture it so the tests can invoke it the way
// a Prometheus scrape would.
jest.mock('@cos/tracing', () => ({
  createMetrics: () => ({
    financeLedgerDrift: { addCallback: (cb: unknown) => gaugeCallbacks.push(cb as GaugeCallback) },
  }),
}));

jest.mock('../../../shared/prisma/create-prisma-client', () => ({
  createPrismaClient: () => ({ $queryRaw: mockQueryRaw, $disconnect: mockDisconnect }),
}));

const mockInfo = jest.fn();
const mockError = jest.fn();
const mockQueryRaw = jest.fn();
const mockDisconnect = jest.fn().mockResolvedValue(undefined);

type GaugeObservation = { value: number; attrs: Record<string, string> };
type GaugeResult = { observe: (value: number, attrs: Record<string, string>) => void };
type GaugeCallback = (result: GaugeResult) => void;
const gaugeCallbacks: GaugeCallback[] = [];

import {
  LedgerReconciliationService,
  LEDGER_RECONCILIATION_JOB,
  LEDGER_RECONCILIATION_LEASE_SECONDS,
  RECONCILIATION_GRACE_MINUTES,
  RECONCILIATION_SAMPLE_LIMIT,
} from '../ledger-reconciliation.service';
import { makeLockDouble } from '../../../shared/scheduling/__tests__/lock-double';

const TENANT = '11111111-1111-4111-8111-111111111111';
const PO_ID = '22222222-2222-4222-8222-222222222222';
const INVOICE_ID = '33333333-3333-4333-8333-333333333333';

/**
 * The service issues its four queries in a fixed order: missing POs, missing invoices, duplicates,
 * orphans. Queue one result set per query.
 */
function queueQueries(
  missingPos: unknown[],
  missingInvoices: unknown[],
  duplicates: unknown[],
  orphans: unknown[],
): void {
  mockQueryRaw
    .mockResolvedValueOnce(missingPos)
    .mockResolvedValueOnce(missingInvoices)
    .mockResolvedValueOnce(duplicates)
    .mockResolvedValueOnce(orphans);
}

/** The SQL text of the Nth query, as a single normalised line. */
function sqlOf(callIndex: number): string {
  const strings = mockQueryRaw.mock.calls[callIndex]![0] as string[];
  return strings.join(' ? ').replace(/\s+/g, ' ');
}

/** Drive every registered gauge callback the way a scrape would. */
function scrape(): GaugeObservation[] {
  const out: GaugeObservation[] = [];
  for (const cb of gaugeCallbacks) cb({ observe: (value, attrs) => out.push({ value, attrs }) });
  return out;
}

function build(granted = true) {
  const lock = makeLockDouble(granted);
  gaugeCallbacks.length = 0;
  return { svc: new LedgerReconciliationService(lock.service), lock };
}

beforeEach(() => {
  jest.clearAllMocks();
  gaugeCallbacks.length = 0;
});

describe('LedgerReconciliationService', () => {
  it('reports no drift when every PO and invoice has its transaction', async () => {
    const { svc } = build();
    queueQueries([], [], [], []);

    const report = await svc.reconcile();

    expect(report).toEqual({ findings: [], total: 0 });
    expect(mockError).not.toHaveBeenCalled();
    expect(mockInfo).toHaveBeenCalledWith(
      { event: 'finance.ledger.reconciled' },
      expect.any(String),
    );
  });

  it('finds a purchase order that never reached the ledger', async () => {
    const { svc } = build();
    queueQueries(
      [{ tenant_id: TENANT, po_id: PO_ID, po_number: 'PO-0001', total_amount: '500000.0000' }],
      [],
      [],
      [],
    );

    const report = await svc.reconcile();

    expect(report!.total).toBe(1);
    expect(report!.findings).toEqual([
      {
        kind: 'missing',
        source: 'PURCHASE_ORDER',
        count: 1,
        sample: [
          { tenant_id: TENANT, source_id: PO_ID, detail: 'PO-0001 — 500000.0000 not committed' },
        ],
      },
    ]);
    // Error, not info: a budget under-committed by 500,000 is not a routine observation.
    expect(mockError).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'finance.ledger.drift', total: 1 }),
      expect.any(String),
    );
  });

  it('finds an invoice that never reached the ledger', async () => {
    const { svc } = build();
    queueQueries(
      [],
      [{ tenant_id: TENANT, invoice_id: INVOICE_ID, invoice_number: 'INV-9', amount: '120.5000' }],
      [],
      [],
    );

    const report = await svc.reconcile();

    expect(report!.findings).toHaveLength(1);
    expect(report!.findings[0]).toMatchObject({ kind: 'missing', source: 'INVOICE', count: 1 });
  });

  // `createTransaction` is a bare INSERT and cost_transactions has no unique key on
  // (tenant_id, source_type, source_id). The only thing stopping a double-count is KafkaConsumer's
  // Redis idempotency claim, which expires after 24h and is deliberately deleted on the DLQ-replay
  // path — a cache, not a constraint. Over-committed is as wrong as under-committed.
  it('finds a source counted twice, split by source type', async () => {
    const { svc } = build();
    queueQueries(
      [],
      [],
      [
        { tenant_id: TENANT, source_type: 'PURCHASE_ORDER', source_id: PO_ID, n: 2n },
        { tenant_id: TENANT, source_type: 'INVOICE', source_id: INVOICE_ID, n: 3n },
      ],
      [],
    );

    const report = await svc.reconcile();

    expect(report!.total).toBe(2);
    expect(report!.findings.map((f) => [f.kind, f.source, f.count])).toEqual([
      ['duplicate', 'PURCHASE_ORDER', 1],
      ['duplicate', 'INVOICE', 1],
    ]);
    expect(report!.findings[0]!.sample[0]!.detail).toBe('2 transactions for one purchase_order');
  });

  it('finds a transaction charged against a source that no longer exists', async () => {
    const { svc } = build();
    queueQueries(
      [],
      [],
      [],
      [{ tenant_id: TENANT, source_type: 'PURCHASE_ORDER', source_id: PO_ID, amount: '99.0000' }],
    );

    const report = await svc.reconcile();

    expect(report!.findings).toEqual([
      {
        kind: 'orphan',
        source: 'PURCHASE_ORDER',
        count: 1,
        sample: [
          {
            tenant_id: TENANT,
            source_id: PO_ID,
            detail: '99.0000 charged against a purchase_order that does not exist',
          },
        ],
      },
    ]);
  });

  // The count is what alerts fire on. If the sample cap silently capped the count too, a broker
  // outage stranding 5,000 events would page as "50" and read as a minor blip.
  it('caps the logged sample without capping the count', async () => {
    const { svc } = build();
    const many = Array.from({ length: RECONCILIATION_SAMPLE_LIMIT + 7 }, (_, i) => ({
      tenant_id: TENANT,
      po_id: PO_ID,
      po_number: `PO-${i}`,
      total_amount: '1.0000',
    }));
    queueQueries(many, [], [], []);

    const report = await svc.reconcile();

    expect(report!.findings[0]!.count).toBe(RECONCILIATION_SAMPLE_LIMIT + 7);
    expect(report!.findings[0]!.sample).toHaveLength(RECONCILIATION_SAMPLE_LIMIT);
  });

  it('leases the job so one replica sweeps, not three', async () => {
    const { svc, lock } = build();
    queueQueries([], [], [], []);

    await svc.reconcile();

    expect(lock.calls).toEqual([
      { jobName: LEDGER_RECONCILIATION_JOB, leaseSeconds: LEDGER_RECONCILIATION_LEASE_SECONDS },
    ]);
  });

  it('does nothing on a replica that lost the lease', async () => {
    const { svc } = build(false);

    await expect(svc.reconcile()).resolves.toBeNull();
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  describe('the queries themselves', () => {
    beforeEach(() => queueQueries([], [], [], []));

    // A join on source_id alone would match another tenant's PO on the RLS-bypassing connection —
    // where nothing else would stop it — and report a real gap as reconciled.
    it('matches every source to its transaction WITHIN one tenant', async () => {
      await build().svc.reconcile();
      expect(sqlOf(0)).toContain('ct.tenant_id = po.tenant_id');
      expect(sqlOf(1)).toContain('ct.tenant_id = i.tenant_id');
      expect(sqlOf(2)).toContain('GROUP BY ct.tenant_id, ct.source_type, ct.source_id');
      expect(sqlOf(3)).toContain('po.tenant_id = ct.tenant_id');
      expect(sqlOf(3)).toContain('i.tenant_id = ct.tenant_id');
    });

    // Without the grace window the job reports every PO created in the last few seconds as drift,
    // every hour, and the alert becomes noise that gets silenced.
    it('gives an in-flight purchase order the grace window before calling it drift', async () => {
      await build().svc.reconcile();
      const sql = sqlOf(0);
      expect(sql).toContain('po.created_at < now() - make_interval(mins => ? )');
      expect(mockQueryRaw.mock.calls[0]![1]).toBe(RECONCILIATION_GRACE_MINUTES);
    });

    it('compares a PO only against a PURCHASE_ORDER transaction, and an invoice only against an INVOICE one', async () => {
      await build().svc.reconcile();
      expect(sqlOf(0)).toContain("ct.source_type = 'PURCHASE_ORDER'");
      expect(sqlOf(1)).toContain("ct.source_type = 'INVOICE'");
    });

    // The ADJUSTMENT source type is a manual finance entry with no procurement row behind it by
    // design. Sweeping it in would report every legitimate adjustment as an orphan.
    it('leaves manual ADJUSTMENT transactions alone', async () => {
      await build().svc.reconcile();
      for (const i of [2, 3]) expect(sqlOf(i)).not.toContain('ADJUSTMENT');
      expect(sqlOf(2)).toContain("ct.source_type IN ('PURCHASE_ORDER', 'INVOICE')");
      // The orphan query has no IN-list: each arm names its own source_type, which excludes
      // ADJUSTMENT the same way.
      expect(sqlOf(3)).toContain("ct.source_type = 'PURCHASE_ORDER' AND po.po_id IS NULL");
      expect(sqlOf(3)).toContain("ct.source_type = 'INVOICE' AND i.invoice_id IS NULL");
    });

    // The exception carved into Phase 7's no-direct-query rule is read-only. If this job ever grows
    // a write, the ledger has two writers and stops being reproducible from the event log.
    it('never writes', async () => {
      await build().svc.reconcile();
      for (const i of [0, 1, 2, 3]) {
        expect(sqlOf(i)).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
      }
    });
  });

  describe('the gauge', () => {
    // Absent ≠ zero. A gauge that reads 0 before the first sweep is an all-clear nobody earned —
    // which is the exact failure this job exists to remove, reintroduced one layer up.
    it('reports nothing before the first sweep', () => {
      build();
      expect(scrape()).toEqual([]);
    });

    it('reports every kind after a clean sweep, so a drop to zero is visible', async () => {
      const { svc } = build();
      queueQueries([], [], [], []);
      await svc.reconcile();

      const observed = scrape();
      expect(observed).toHaveLength(6); // 3 kinds × 2 sources
      expect(observed.every((o) => o.value === 0)).toBe(true);
    });

    it('reports the drift it found, labelled by kind and source', async () => {
      const { svc } = build();
      queueQueries(
        [{ tenant_id: TENANT, po_id: PO_ID, po_number: 'PO-1', total_amount: '1.0000' }],
        [],
        [],
        [],
      );
      await svc.reconcile();

      expect(scrape()).toContainEqual({
        value: 1,
        attrs: { kind: 'missing', source: 'PURCHASE_ORDER' },
      });
    });
  });
});
