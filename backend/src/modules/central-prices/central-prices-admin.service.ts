// CentralPricesAdminService — SYSTEM_ADMIN management of the ราคากลาง catalog (ADR-061; D8, D9).
//
// ONE TRANSACTION PER ATTEMPT. An import or a sync writes, together or not at all:
//   1. the catalog rows (upsert on (code, effective_period)),
//   2. its platform.central_price_sync_runs row,
//   3. its platform.audit_logs row — action `central_prices.import` / `central_prices.sync`,
//      resource_type `central_price_catalog`, resource_id = the run, metadata = justification + counts,
//   4. the platform.central_price_catalog.updated.v1 outbox row, when any catalog row changed.
// So a price never changes without its audit row and its event, and an attempt that cannot be audited
// changes nothing (§6.7 "No System Admin action is silent"; §35.13 ESC-13 for the outbox).
//
// FAILED ATTEMPTS ARE RECORDED TOO. The register's Failed-Sync panel reads them. A file that cannot be
// imported as a whole records a FAILED run and its audit row in their own transaction, then answers 422.
// A database failure while writing records a FAILED run the same way (best effort) and re-throws — the
// catalog is untouched because the write transaction rolled back.
//
// CONNECTION. The platform connection (createPrismaClient(), DATABASE_URL), as TenantService and
// PlatformSettingsService use for SYSTEM_ADMIN platform writes: app_user holds SELECT only on the catalog
// and the run table (migration 20260915000002). SET LOCAL app.current_tenant_id is set to the CALLER's
// tenant before the audit INSERT, exactly as TenantService.writeAdminAudit does, so the row also satisfies
// audit_logs' rls_audit_insert should this ever run as app_user. The only interpolated value is that
// tenant id, UUID-checked first — a GUC cannot be bound.

import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { OutboxPublisher } from '@cos/kafka';
import { createLogger } from '@cos/logger';
import type { CentralPriceCatalogUpdatedPayload } from '@cos/shared';
import { createPrismaClient } from '../../shared/prisma/create-prisma-client';
import { assertSafeTenantId } from '../../shared/prisma/assert-safe-tenant-id';
import { buildOutboxEvent } from '../../shared/outbox/outbox.types';
import { CENTRAL_PRICE_ADAPTER } from './adapters/central-price-adapter';
import type {
  CentralPriceAdapter,
  CentralPriceFetchResult,
} from './adapters/central-price-adapter';
import { decodeCatalogCursor, encodeCatalogCursor } from './central-price-cursor';
import { importFailed, unsupportedFileType } from './central-price-errors';
import {
  CentralPriceFileError,
  detectFileKind,
  readCentralPriceTable,
} from './central-price-file.parser';
import {
  afterCursor,
  CATALOG_COLUMNS,
  CATALOG_ORDER,
  catalogWhere,
  pageSize,
  toCentralPriceRow,
  toSyncRun,
  type CatalogDbRow,
  type SyncRunDbRow,
} from './central-price-queries';
import {
  EFFECTIVE_PERIOD_RE,
  SOURCE_FOR_KIND,
  validateCentralPriceRecords,
  validateCentralPriceTable,
  type CentralPriceInputRow,
} from './central-price-rows';
import { uploadFileName } from './central-price-upload';
import type {
  CentralPriceListResponse,
  ImportResult,
  RejectedRow,
  SyncRun,
  SyncRunKind,
  SyncRunOutcome,
  SyncStatusResponse,
} from './central-prices.types';

const logger = createLogger('central-prices-admin-service');

/** Envelope tenant_id of a platform-scope event (PLATFORM_TENANT_SENTINEL in notification.service.ts). */
const PLATFORM_TENANT = 'platform';

export const CATALOG_UPDATED_EVENT = 'platform.central_price_catalog.updated.v1';

/**
 * A 20,000-row import is a few thousand-row statements plus the lock and the audit write. Prisma's 5 s
 * default is sized for a request, not a national price list.
 */
const WRITE_TX_TIMEOUT_MS = 60_000;

/** Rows per INSERT … SELECT FROM UNNEST statement. */
const UPSERT_CHUNK = 1_000;

/** Who is acting: the SYSTEM_ADMIN's own user id and tenant (for the audit row's RLS). */
export interface AdminCaller {
  actorId: string;
  tenantId: string;
}

export interface CatalogListQuery {
  q?: string;
  category?: string;
  effective_period?: string;
  cursor?: string;
  limit?: number;
}

export interface ImportRequest {
  justification: string;
  effective_period: string;
  source_ref: string | null;
  file: { filename: string; bytes: Buffer };
}

type Tx = Prisma.TransactionClient;

/** Everything a run row records, before the database gives it an id. */
interface RunRecord {
  kind: SyncRunKind;
  source_name: string;
  effective_period: string | null;
  started_at: Date;
  outcome: SyncRunOutcome;
  records_total: number;
  records_inserted: number;
  records_updated: number;
  records_rejected: number;
  error_code: string | null;
  error_message: string | null;
}

@Injectable()
export class CentralPricesAdminService implements OnModuleDestroy {
  private readonly prisma = createPrismaClient();

  constructor(@Inject(CENTRAL_PRICE_ADAPTER) private readonly adapter: CentralPriceAdapter) {}

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }

  // ── Reads ─────────────────────────────────────────────────────────────────

  /** The register: every row (any status), filtered, keyset-paged, with the total and the period list. */
  async list(query: CatalogListQuery): Promise<CentralPriceListResponse> {
    const limit = pageSize(query.limit);
    const cursor = query.cursor ? decodeCatalogCursor(query.cursor) : undefined;
    const where = catalogWhere({
      q: query.q,
      category: query.category,
      effective_period: query.effective_period,
    });

    const [rows, counted, periods] = await Promise.all([
      this.prisma.$queryRaw<CatalogDbRow[]>(Prisma.sql`
        SELECT ${CATALOG_COLUMNS}
          FROM platform.central_price_catalog c
         WHERE ${where} AND ${afterCursor(cursor)}
         ${CATALOG_ORDER}
         LIMIT ${limit + 1}
      `),
      this.prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`
        SELECT count(*)::int AS total FROM platform.central_price_catalog c WHERE ${where}
      `),
      this.prisma.$queryRaw<Array<{ effective_period: string }>>`
        SELECT effective_period
          FROM platform.central_price_catalog
         GROUP BY effective_period -- not DISTINCT: DISTINCT refuses an ORDER BY on the COLLATE expression
         ORDER BY effective_period COLLATE "C" DESC
      `,
    ]);

    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      rows: page.map(toCentralPriceRow),
      total: counted[0]!.total, // count(*) without GROUP BY always returns exactly one row
      next_cursor: rows.length > limit && last ? encodeCatalogCursor(last) : null,
      periods: periods.map((p) => p.effective_period),
    };
  }

  /** The API-Sync / Failed-Sync panels. */
  async syncStatus(): Promise<SyncStatusResponse> {
    const [lastRun, lastSuccess, lastFailure] = await Promise.all([
      this.latestRun(Prisma.sql`TRUE`),
      this.latestRun(Prisma.sql`outcome = 'SUCCEEDED'`),
      this.latestRun(Prisma.sql`outcome = 'FAILED'`),
    ]);
    return {
      adapter: { name: this.adapter.name, configured: this.adapter.isConfigured() },
      last_run: lastRun,
      last_success: lastSuccess,
      last_failure: lastFailure,
    };
  }

  private async latestRun(condition: Prisma.Sql): Promise<SyncRun | null> {
    const rows = await this.prisma.$queryRaw<SyncRunDbRow[]>(Prisma.sql`
      SELECT * FROM platform.central_price_sync_runs
       WHERE ${condition}
       ORDER BY started_at DESC, run_id DESC
       LIMIT 1
    `);
    return rows[0] ? toSyncRun(rows[0]) : null;
  }

  // ── File import ───────────────────────────────────────────────────────────

  async importFile(caller: AdminCaller, request: ImportRequest): Promise<ImportResult> {
    assertSafeTenantId(caller.tenantId);
    const startedAt = new Date();
    const sourceName = uploadFileName(request.file.filename);

    // Not an import attempt yet — the upload itself is the wrong kind, so nothing is recorded (415).
    const kind = detectFileKind(sourceName, request.file.bytes);
    if (!kind) throw unsupportedFileType();

    const base = {
      kind: 'FILE_IMPORT' as const,
      source_name: sourceName,
      effective_period: request.effective_period,
      started_at: startedAt,
    };
    const auditExtra = {
      effective_period: request.effective_period,
      source_ref: request.source_ref,
      file_name: sourceName,
    };

    let table;
    try {
      table = await readCentralPriceTable(kind, request.file.bytes);
    } catch (err: unknown) {
      if (!(err instanceof CentralPriceFileError)) throw err;
      return this.refuseFile(
        caller,
        request.justification,
        auditExtra,
        base,
        err.code,
        err.message,
      );
    }

    const validation = validateCentralPriceTable(table);
    if (!validation.ok) {
      return this.refuseFile(
        caller,
        request.justification,
        auditExtra,
        base,
        validation.error_code,
        validation.message,
      );
    }

    const run = await this.writeAttempt(caller, 'central_prices.import', request.justification, {
      auditExtra,
      run: base,
      total: validation.total,
      valid: validation.valid,
      rejected: validation.rejected,
      source_ref: request.source_ref,
    });

    logger.info(
      {
        run_id: run.run_id,
        outcome: run.outcome,
        effective_period: request.effective_period,
        records_total: run.records_total,
        inserted: run.records_inserted,
        updated: run.records_updated,
        rejected: run.records_rejected,
        actor_id: caller.actorId,
      },
      'central_prices.import',
    );

    return {
      run_id: run.run_id,
      outcome: run.outcome,
      records_total: run.records_total,
      inserted: run.records_inserted,
      updated: run.records_updated,
      rejected: validation.rejected,
    };
  }

  /** Record a whole-file refusal (FAILED run + audit) and answer 422 COS-CPRICE-004 with the run id. */
  private async refuseFile(
    caller: AdminCaller,
    justification: string,
    auditExtra: Record<string, string | null>,
    base: Pick<RunRecord, 'kind' | 'source_name' | 'effective_period' | 'started_at'>,
    errorCode: string,
    message: string,
  ): Promise<never> {
    const run = await this.recordOnly(caller, 'central_prices.import', justification, auditExtra, {
      ...base,
      outcome: 'FAILED',
      records_total: 0,
      records_inserted: 0,
      records_updated: 0,
      records_rejected: 0,
      error_code: errorCode,
      error_message: message,
    });
    logger.warn(
      { run_id: run.run_id, error_code: errorCode, actor_id: caller.actorId },
      'central_prices.import.refused',
    );
    throw importFailed(run.run_id, errorCode, message);
  }

  // ── Adapter sync ──────────────────────────────────────────────────────────

  /** Run the configured CentralPriceAdapter once and record the outcome — NOT_CONFIGURED included (D9). */
  async sync(caller: AdminCaller, justification: string): Promise<SyncRun> {
    assertSafeTenantId(caller.tenantId);
    const startedAt = new Date();
    const result = await this.fetchFromAdapter();
    const base = {
      kind: 'GOV_API' as const,
      source_name: this.adapter.name,
      started_at: startedAt,
    };
    const auditExtra = { adapter: this.adapter.name };

    if (result.outcome === 'NOT_CONFIGURED' || result.outcome === 'FAILED') {
      const run = await this.recordOnly(caller, 'central_prices.sync', justification, auditExtra, {
        ...base,
        effective_period: null,
        outcome: result.outcome,
        records_total: 0,
        records_inserted: 0,
        records_updated: 0,
        records_rejected: 0,
        error_code:
          result.outcome === 'FAILED' ? result.error_code.slice(0, 64) : 'ADAPTER_NOT_CONFIGURED',
        error_message: result.message,
      });
      logger.info(
        { run_id: run.run_id, outcome: run.outcome, adapter: this.adapter.name },
        'central_prices.sync',
      );
      return toSyncRun(run);
    }

    if (!EFFECTIVE_PERIOD_RE.test(result.effective_period)) {
      const run = await this.recordOnly(caller, 'central_prices.sync', justification, auditExtra, {
        ...base,
        effective_period: null,
        outcome: 'FAILED',
        records_total: result.records.length,
        records_inserted: 0,
        records_updated: 0,
        records_rejected: result.records.length,
        error_code: 'INVALID_PERIOD',
        error_message: 'The adapter returned an effective_period this catalog cannot store.',
      });
      return toSyncRun(run);
    }

    const { valid, rejected } = validateCentralPriceRecords(
      result.records,
      result.records.map((_, i) => i + 1),
    );
    const run = await this.writeAttempt(caller, 'central_prices.sync', justification, {
      auditExtra,
      run: { ...base, effective_period: result.effective_period },
      total: result.records.length,
      valid,
      rejected,
      source_ref: result.source_ref,
    });
    logger.info(
      { run_id: run.run_id, outcome: run.outcome, adapter: this.adapter.name },
      'central_prices.sync',
    );
    return toSyncRun(run);
  }

  /** The adapter contract says fetch() resolves; a throw is still recorded, as a FAILED run. */
  private async fetchFromAdapter(): Promise<CentralPriceFetchResult> {
    try {
      return await this.adapter.fetch();
    } catch (err: unknown) {
      logger.error(
        { adapter: this.adapter.name, err: err instanceof Error ? err.message : String(err) },
        'central_prices.sync.adapter_threw',
      );
      return {
        outcome: 'FAILED',
        error_code: 'ADAPTER_ERROR',
        message: 'The price source adapter failed unexpectedly.',
      };
    }
  }

  // ── Writes ────────────────────────────────────────────────────────────────

  /**
   * Upsert the valid rows (if any), then run + audit + event, in one transaction. All rows rejected is a
   * FAILED run with error_code NO_VALID_ROWS and nothing written — the response still lists every reason.
   * A database failure records a FAILED run in a separate transaction (best effort) and re-throws.
   */
  private async writeAttempt(
    caller: AdminCaller,
    action: 'central_prices.import' | 'central_prices.sync',
    justification: string,
    attempt: {
      auditExtra: Record<string, string | null>;
      run: Pick<RunRecord, 'kind' | 'source_name' | 'started_at'> & { effective_period: string };
      total: number;
      valid: CentralPriceInputRow[];
      rejected: RejectedRow[];
      source_ref: string | null;
    },
  ): Promise<SyncRunDbRow> {
    const counts = {
      records_total: attempt.total,
      records_rejected: attempt.rejected.length,
    };

    if (attempt.valid.length === 0) {
      return this.recordOnly(caller, action, justification, attempt.auditExtra, {
        ...attempt.run,
        ...counts,
        outcome: 'FAILED',
        records_inserted: 0,
        records_updated: 0,
        error_code: 'NO_VALID_ROWS',
        error_message: 'Every row was rejected; nothing was imported.',
      });
    }

    const source = SOURCE_FOR_KIND[attempt.run.kind];
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const written = await this.upsertRows(
            tx,
            attempt.valid,
            attempt.run.effective_period,
            source,
            attempt.source_ref,
          );
          const run = await this.insertRunAndAudit(
            tx,
            caller,
            action,
            justification,
            attempt.auditExtra,
            {
              ...attempt.run,
              ...counts,
              outcome: 'SUCCEEDED',
              records_inserted: written.inserted,
              records_updated: written.updated,
              error_code: null,
              error_message: null,
            },
          );
          const payload: CentralPriceCatalogUpdatedPayload = {
            run_id: run.run_id,
            source,
            effective_period: attempt.run.effective_period,
            records_inserted: written.inserted,
            records_updated: written.updated,
          };
          // valid.length > 0 here, so at least one row was inserted or updated — the event always
          // describes a real change.
          await OutboxPublisher.write(
            tx,
            buildOutboxEvent({
              eventType: CATALOG_UPDATED_EVENT,
              tenantId: PLATFORM_TENANT,
              actorId: caller.actorId,
              correlationId: randomUUID(),
              payload,
            }),
          );
          return run;
        },
        { timeout: WRITE_TX_TIMEOUT_MS },
      );
    } catch (err: unknown) {
      logger.error(
        { action, actor_id: caller.actorId, err: err instanceof Error ? err.message : String(err) },
        'central_prices.write_failed',
      );
      await this.recordOnly(caller, action, justification, attempt.auditExtra, {
        ...attempt.run,
        ...counts,
        outcome: 'FAILED',
        records_inserted: 0,
        records_updated: 0,
        error_code: 'WRITE_FAILED',
        error_message: 'The catalog could not be written; nothing was changed.',
      }).catch((recordErr: unknown) =>
        logger.error(
          { err: recordErr instanceof Error ? recordErr.message : String(recordErr) },
          'central_prices.write_failed.unrecorded',
        ),
      );
      throw err;
    }
  }

  /** A run and its audit row, with no catalog change. */
  private async recordOnly(
    caller: AdminCaller,
    action: 'central_prices.import' | 'central_prices.sync',
    justification: string,
    auditExtra: Record<string, string | null>,
    record: RunRecord,
  ): Promise<SyncRunDbRow> {
    return this.prisma.$transaction((tx) =>
      this.insertRunAndAudit(tx, caller, action, justification, auditExtra, record),
    );
  }

  /**
   * Upsert rows for one period. The per-period advisory lock serialises two imports of the SAME period,
   * so the inserted / updated split — read as "which of these codes already exist" just before the write
   * — is exact rather than a guess under concurrency. Different periods do not contend.
   */
  private async upsertRows(
    tx: Tx,
    rows: CentralPriceInputRow[],
    period: string,
    source: string,
    sourceRef: string | null,
  ): Promise<{ inserted: number; updated: number }> {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${`central_price_catalog:${period}`}::text, 0))
    `;
    const codes = rows.map((r) => r.code);
    const existing = await tx.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::int AS count
        FROM platform.central_price_catalog
       WHERE effective_period = ${period}
         AND code = ANY(${codes}::text[])
    `;
    const updated = existing[0]!.count; // count(*) without GROUP BY always returns exactly one row

    for (let start = 0; start < rows.length; start += UPSERT_CHUNK) {
      const chunk = rows.slice(start, start + UPSERT_CHUNK);
      // published_at = now() on insert AND on update: a file import is the act of publishing those
      // figures for that period (see ADR-061 amendment). is_active is restored to true for the same
      // reason — re-importing a withdrawn code republishes it.
      await tx.$executeRaw`
        INSERT INTO platform.central_price_catalog (
          code, description, category, unit, central_price, currency_code,
          effective_period, source, source_ref, published_at, is_active
        )
        SELECT r.code, r.description, r.category, r.unit, r.central_price, r.currency_code,
               ${period}, ${source}, ${sourceRef}, now(), true
          FROM UNNEST(
            ${chunk.map((r) => r.code)}::text[],
            ${chunk.map((r) => r.description)}::text[],
            ${chunk.map((r) => r.category)}::text[],
            ${chunk.map((r) => r.unit)}::text[],
            ${chunk.map((r) => r.central_price)}::numeric[],
            ${chunk.map((r) => r.currency_code)}::text[]
          ) AS r(code, description, category, unit, central_price, currency_code)
        ON CONFLICT (code, effective_period) DO UPDATE
           SET description   = EXCLUDED.description,
               category      = EXCLUDED.category,
               unit          = EXCLUDED.unit,
               central_price = EXCLUDED.central_price,
               currency_code = EXCLUDED.currency_code,
               source        = EXCLUDED.source,
               source_ref    = EXCLUDED.source_ref,
               published_at  = EXCLUDED.published_at,
               is_active     = true,
               updated_at    = now()
      `;
    }
    return { inserted: rows.length - updated, updated };
  }

  private async insertRunAndAudit(
    tx: Tx,
    caller: AdminCaller,
    action: 'central_prices.import' | 'central_prices.sync',
    justification: string,
    auditExtra: Record<string, string | null>,
    record: RunRecord,
  ): Promise<SyncRunDbRow> {
    // started_at is the application's clock and finished_at the database's. The two drift apart (measured 2026-09-15:
    // a Docker Postgres 1 ms behind its Windows host), and a finished_at a millisecond "before" started_at broke the
    // finished_after_start CHECK and turned a refused file into a 500. GREATEST keeps the CHECK true under that skew.
    const [run] = await tx.$queryRaw<SyncRunDbRow[]>`
      INSERT INTO platform.central_price_sync_runs (
        kind, source_name, effective_period, started_at, finished_at, outcome,
        records_total, records_inserted, records_updated, records_rejected,
        error_code, error_message, actor_id
      )
      VALUES (
        ${record.kind}, ${record.source_name}, ${record.effective_period},
        ${record.started_at.toISOString()}::timestamptz,
        GREATEST(now(), ${record.started_at.toISOString()}::timestamptz), ${record.outcome},
        ${record.records_total}, ${record.records_inserted}, ${record.records_updated},
        ${record.records_rejected}, ${record.error_code}, ${record.error_message},
        ${caller.actorId}::uuid
      )
      RETURNING *
    `;

    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${caller.tenantId}'`);
    await tx.$executeRaw`
      INSERT INTO platform.audit_logs (tenant_id, actor_id, action, resource_type, resource_id, metadata)
      VALUES (
        ${caller.tenantId}::uuid,
        ${caller.actorId}::uuid,
        ${action},
        'central_price_catalog',
        ${run!.run_id}::uuid,
        ${JSON.stringify({
          justification,
          ...auditExtra,
          run_id: run!.run_id,
          outcome: record.outcome,
          records_total: record.records_total,
          records_inserted: record.records_inserted,
          records_updated: record.records_updated,
          records_rejected: record.records_rejected,
          error_code: record.error_code,
        })}::jsonb
      )
    `;
    return run!;
  }
}
