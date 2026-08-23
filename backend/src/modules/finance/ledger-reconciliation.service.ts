// LedgerReconciliationService — TDD OQ-31.
//
// WHY THIS EXISTS. Phase 7's constraint is "all cross-service data arrives via Kafka — no direct DB
// queries to Procurement", and `finance.cost_transactions` is built entirely from
// `procurement.po.created.v1` / `procurement.invoice.received.v1`. The outbox is DURABLE, not
// transactional (ADR-094): a business write commits, and the event that carries it to Finance is
// published afterwards. Every step after that commit can fail — the poller can retire a row after 10
// attempts, a consumer can dead-letter, a topic can be recreated. When it does, the project's
// committed cost is quietly LOWER than the purchase orders that exist, and nothing in the system
// disagrees with anything else, because Finance's only view of Procurement is the event it never got.
//
// A ledger derived from a stream needs a periodic comparison against the stream's SOURCE, or its
// errors are permanent and invisible. That comparison is the one thing the no-direct-query rule
// forbids, so the rule now carries an explicit exception for it (`00_master` § PHASE 7). The
// exception is deliberately narrow, and the shape of this file is the boundary:
//
//   - READ ONLY, and only the identity + amount columns needed to compare.
//   - It never feeds a request, an API response, or a business decision. Its output is a log line and
//     a gauge.
//   - It never WRITES a cost transaction. Repair is re-publishing the missing event, so the ledger is
//     still built by exactly one code path (`FinanceConsumer`) and stays replay-consistent. A job
//     that inserted the row directly would be a second writer with no event behind it — and, since
//     `cost_transactions` has no unique key on (tenant_id, source_type, source_id), the first
//     redelivery of the real event would then double-count it.
//
// WHAT IT FINDS. Three drift kinds, all of which are silent today:
//   missing   — a PO/invoice exists with no cost transaction. The budget is UNDER-committed: the
//               classic dropped event. This is the one OQ-31 was raised about.
//   duplicate — more than one transaction for the same source. The budget is OVER-committed.
//               `createTransaction` is a plain INSERT with no unique constraint behind it, so the
//               only thing preventing a double-count is KafkaConsumer's Redis idempotency claim —
//               a `kafka:processed:*` key with a 24h TTL. That is a cache, not a constraint: a
//               redelivery after the TTL, a flushed or failed-over Redis, or a DLQ replay (which
//               DELETES the key on purpose) all get through it.
//   orphan    — a transaction whose source row is gone. The budget is over-committed against
//               something that no longer exists.
//
// It reports; it does not alert by itself. `finance_ledger_drift` is the alerting surface.

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createLogger } from '@cos/logger';
import { createMetrics } from '@cos/tracing';
import { createPrismaClient } from '../../shared/prisma/create-prisma-client';
import { ScheduledJobLockService } from '../../shared/scheduling/scheduled-job-lock.service';

const logger = createLogger('ledger-reconciliation');
const metrics = createMetrics();

/** @Cron name and the lease key in platform.scheduled_job_locks — the same string on purpose. */
export const LEDGER_RECONCILIATION_JOB = 'finance-ledger-reconciliation';

/** Well under the hourly schedule; three read-only queries do not take five minutes. */
export const LEDGER_RECONCILIATION_LEASE_SECONDS = 300;

/**
 * How long a purchase order is allowed to exist before its absence from the ledger counts as drift.
 *
 * This is the in-flight window, not a tolerance: publish → poll → consume is normally sub-second, but
 * `OutboxPollerService` retries with backoff across 10 attempts, and a PO that is mid-retry is not
 * drift. Fifteen minutes clears the retry ladder with room to spare; a genuinely dropped event stays
 * dropped and is reported on the next hourly pass.
 */
export const RECONCILIATION_GRACE_MINUTES = 15;

/**
 * Cap on rows named per drift kind. The COUNT is exact and unbounded — it is what the gauge and the
 * alert use. The row list is a sample for the log, because a broker outage can strand thousands of
 * events and a log line naming all of them helps nobody.
 */
export const RECONCILIATION_SAMPLE_LIMIT = 50;

export type DriftKind = 'missing' | 'duplicate' | 'orphan';
export type DriftSource = 'PURCHASE_ORDER' | 'INVOICE';

export interface DriftSample {
  tenant_id: string;
  source_id: string;
  detail: string;
}

export interface DriftFinding {
  kind: DriftKind;
  source: DriftSource;
  count: number;
  sample: DriftSample[];
}

const SOURCES: readonly DriftSource[] = ['PURCHASE_ORDER', 'INVOICE'];
const KINDS: readonly DriftKind[] = ['missing', 'duplicate', 'orphan'];

export interface ReconciliationReport {
  findings: DriftFinding[];
  /** Every drift kind summed. Zero means the ledger agrees with Procurement. */
  total: number;
}

@Injectable()
export class LedgerReconciliationService implements OnModuleDestroy {
  // Privileged, non-tenant connection — the same choice TombstonePruneService makes and for the same
  // reason: a scheduled sweep has no request behind it, so there is no CLS tenant for
  // TenantPrismaService to read, and the comparison is cross-tenant by nature.
  private readonly prisma = createPrismaClient();

  /**
   * Last completed run's counts, keyed `${kind}:${source}`. The gauge reads THIS rather than querying
   * on scrape: Prometheus scrapes every 15s and the sweep is four joins over two schemas.
   * Deliberately empty until the first run — a gauge reporting 0 before anything has been compared
   * would read as "reconciled and clean", which is exactly the false all-clear this job exists to
   * prevent.
   */
  private lastCounts = new Map<string, number>();

  constructor(private readonly locks: ScheduledJobLockService) {
    metrics.financeLedgerDrift.addCallback((result) => {
      for (const [key, count] of this.lastCounts) {
        const [kind, source] = key.split(':');
        result.observe(count, { kind: kind!, source: source! });
      }
    });
  }

  /**
   * Compare the ledger against Procurement. Returns the report, or null when another replica holds
   * the lease.
   */
  @Cron('37 * * * *', { timeZone: 'UTC', name: LEDGER_RECONCILIATION_JOB })
  async reconcile(): Promise<ReconciliationReport | null> {
    return this.locks.runExclusively(
      LEDGER_RECONCILIATION_JOB,
      LEDGER_RECONCILIATION_LEASE_SECONDS,
      async () => {
        const findings = [
          ...(await this.findMissingPurchaseOrders()),
          ...(await this.findMissingInvoices()),
          ...(await this.findDuplicates()),
          ...(await this.findOrphans()),
        ].filter((f) => f.count > 0);

        const counts = new Map<string, number>();
        for (const source of SOURCES) {
          for (const kind of KINDS) {
            counts.set(
              `${kind}:${source}`,
              findings.find((f) => f.kind === kind && f.source === source)?.count ?? 0,
            );
          }
        }
        this.lastCounts = counts;

        const total = findings.reduce((sum, f) => sum + f.count, 0);
        if (total === 0) {
          logger.info({ event: 'finance.ledger.reconciled' }, 'ledger agrees with procurement');
        } else {
          // Error, not warn: every one of these is money the budget is wrong about, and each needs a
          // human to decide whether to re-publish the event or void the transaction.
          logger.error(
            { event: 'finance.ledger.drift', total, findings },
            'cost ledger disagrees with procurement',
          );
        }
        return { findings, total };
      },
    );
  }

  /**
   * Purchase orders with no committed cost transaction.
   *
   * `created_at` is the grace anchor because it is when the event was published. Rows are matched on
   * (tenant_id, source_id) — source_id alone would be a cross-tenant join, and this query runs on the
   * RLS-bypassing connection where nothing else would stop it.
   */
  private async findMissingPurchaseOrders(): Promise<DriftFinding[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ tenant_id: string; po_id: string; po_number: string; total_amount: string }>
    >`
      SELECT po.tenant_id::text, po.po_id::text, po.po_number, po.total_amount::text
        FROM procurement.purchase_orders po
        LEFT JOIN finance.cost_transactions ct
               ON ct.tenant_id   = po.tenant_id
              AND ct.source_id   = po.po_id
              AND ct.source_type = 'PURCHASE_ORDER'
       WHERE po.created_at < now() - make_interval(mins => ${RECONCILIATION_GRACE_MINUTES})
         AND ct.transaction_id IS NULL
       ORDER BY po.created_at
    `;
    return [
      {
        kind: 'missing',
        source: 'PURCHASE_ORDER',
        count: rows.length,
        sample: rows.slice(0, RECONCILIATION_SAMPLE_LIMIT).map((r) => ({
          tenant_id: r.tenant_id,
          source_id: r.po_id,
          detail: `${r.po_number} — ${r.total_amount} not committed`,
        })),
      },
    ];
  }

  /**
   * Invoices with no actual cost transaction.
   *
   * `procurement.invoices` has no `created_at` (see migration 20260604000002), so the grace anchor is
   * `invoice_date`, which is the VENDOR's date, not the row's. An invoice is therefore only checked
   * from the day after its invoice date. That costs up to a day of detection latency and buys no
   * false positives; adding `created_at` to the table would remove both, and is the better fix if
   * this latency ever matters.
   */
  private async findMissingInvoices(): Promise<DriftFinding[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ tenant_id: string; invoice_id: string; invoice_number: string; amount: string }>
    >`
      SELECT i.tenant_id::text, i.invoice_id::text, i.invoice_number, i.amount::text
        FROM procurement.invoices i
        LEFT JOIN finance.cost_transactions ct
               ON ct.tenant_id   = i.tenant_id
              AND ct.source_id   = i.invoice_id
              AND ct.source_type = 'INVOICE'
       WHERE i.invoice_date < current_date
         AND ct.transaction_id IS NULL
       ORDER BY i.invoice_date
    `;
    return [
      {
        kind: 'missing',
        source: 'INVOICE',
        count: rows.length,
        sample: rows.slice(0, RECONCILIATION_SAMPLE_LIMIT).map((r) => ({
          tenant_id: r.tenant_id,
          source_id: r.invoice_id,
          detail: `${r.invoice_number} — ${r.amount} not recorded as actual`,
        })),
      },
    ];
  }

  /** More than one transaction for one source — at-least-once delivery with no unique key behind it. */
  private async findDuplicates(): Promise<DriftFinding[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ tenant_id: string; source_type: DriftSource; source_id: string; n: bigint }>
    >`
      SELECT ct.tenant_id::text, ct.source_type::text AS source_type, ct.source_id::text,
             count(*) AS n
        FROM finance.cost_transactions ct
       WHERE ct.source_type IN ('PURCHASE_ORDER', 'INVOICE')
       GROUP BY ct.tenant_id, ct.source_type, ct.source_id
      HAVING count(*) > 1
       ORDER BY count(*) DESC
    `;
    return SOURCES.map((source) => {
      const forSource = rows.filter((r) => r.source_type === source);
      return {
        kind: 'duplicate' as const,
        source,
        count: forSource.length,
        sample: forSource.slice(0, RECONCILIATION_SAMPLE_LIMIT).map((r) => ({
          tenant_id: r.tenant_id,
          source_id: r.source_id,
          detail: `${r.n} transactions for one ${source.toLowerCase()}`,
        })),
      };
    });
  }

  /** Transactions whose source row no longer exists. */
  private async findOrphans(): Promise<DriftFinding[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ tenant_id: string; source_type: DriftSource; source_id: string; amount: string }>
    >`
      SELECT ct.tenant_id::text, ct.source_type::text AS source_type, ct.source_id::text,
             ct.amount::text
        FROM finance.cost_transactions ct
        LEFT JOIN procurement.purchase_orders po
               ON po.tenant_id = ct.tenant_id AND po.po_id = ct.source_id
        LEFT JOIN procurement.invoices i
               ON i.tenant_id = ct.tenant_id AND i.invoice_id = ct.source_id
       WHERE (ct.source_type = 'PURCHASE_ORDER' AND po.po_id IS NULL)
          OR (ct.source_type = 'INVOICE' AND i.invoice_id IS NULL)
       ORDER BY ct.recorded_at
    `;
    return SOURCES.map((source) => {
      const forSource = rows.filter((r) => r.source_type === source);
      return {
        kind: 'orphan' as const,
        source,
        count: forSource.length,
        sample: forSource.slice(0, RECONCILIATION_SAMPLE_LIMIT).map((r) => ({
          tenant_id: r.tenant_id,
          source_id: r.source_id,
          detail: `${r.amount} charged against a ${source.toLowerCase()} that does not exist`,
        })),
      };
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
