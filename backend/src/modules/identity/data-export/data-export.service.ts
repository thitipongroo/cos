// PDPA §30 access / §31 portability — the request side of the data export (ADR-078).
//
// Closes PDPA-10/11, which docs/registers/pdpa-controls.md records as OPEN. §30 gives the controller
// 30 days to answer a VERIFIED request, so three things have to be true at once: the person is
// re-proven (step-up action token), the request is durable (a row, not a fire-and-forget job), and
// the subject can see its state without re-submitting because nothing visibly happened.
//
// THE ARCHIVE IS NOT MAILED. `expires_at` is the REQUEST's 7-day validity, not a link lifetime: the
// email points at an authenticated in-app page that calls `downloadUrl()` here, which mints a fresh
// 1-hour signed URL per click. A week-long bearer URL for a RESTRICTED payload — one that contains
// every coordinate a person was recorded at — was rejected in ADR-078, and nothing in this class
// creates one.
//
// Connects as app_user (appDatabaseUrl) so RLS binds, with `SET LOCAL app.current_tenant_id` inside
// the same transaction as every statement — transaction-scoped, safe under PgBouncer (QM-18).

import {
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Client, Connection } from '@temporalio/client';
import { createLogger } from '@cos/logger';
import { createPrismaClient } from '../../../shared/prisma/create-prisma-client';
import { appDatabaseUrl } from '../../../shared/prisma/app-database-url';
import { assertSafeTenantId } from '../../../shared/prisma/assert-safe-tenant-id';
import { FileServiceClient } from '../../files/file-service-client.service';
import { StepUpService } from '../step-up/step-up.service';
import type { ExportCategory } from './data-export.collector';

const logger = createLogger('data-export-service');

export const DATA_EXPORT_TASK_QUEUE = 'data-export';

/** ADR-078 product-owner decision 2026-08-04 — how long a completed export stays retrievable. */
const REQUEST_TTL_DAYS = 7;

export type ExportFormat = 'JSON' | 'CSV';
export type ExportStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED' | 'EXPIRED';

export interface ExportRequestView {
  exportId: string;
  categories: ExportCategory[];
  format: ExportFormat;
  fromDate: Date | null;
  toDate: Date | null;
  status: ExportStatus;
  failureReason: string | null;
  requestedAt: Date;
  completedAt: Date | null;
  expiresAt: Date;
  /** Whether a download can be attempted right now — saves the client re-deriving the rule. */
  downloadable: boolean;
}

/** The row shape as it comes back from raw SQL — snake_case, straight from the column names. */
interface ExportRow {
  export_id: string;
  categories: string[];
  format: ExportFormat;
  from_date: Date | null;
  to_date: Date | null;
  status: ExportStatus;
  file_id: string | null;
  failure_reason: string | null;
  requested_at: Date;
  completed_at: Date | null;
  expires_at: Date;
}

/** A request is retrievable only while it is READY, has a file, and has not aged out. */
export function isDownloadable(row: Pick<ExportRow, 'status' | 'file_id' | 'expires_at'>): boolean {
  return row.status === 'READY' && row.file_id !== null && row.expires_at.getTime() > Date.now();
}

function toView(row: ExportRow): ExportRequestView {
  return {
    exportId: row.export_id,
    categories: row.categories as ExportCategory[],
    format: row.format,
    fromDate: row.from_date,
    toDate: row.to_date,
    status: row.status,
    failureReason: row.failure_reason,
    requestedAt: row.requested_at,
    completedAt: row.completed_at,
    expiresAt: row.expires_at,
    downloadable: isDownloadable(row),
  };
}

@Injectable()
export class DataExportService implements OnModuleDestroy {
  private readonly prisma: PrismaClient = createPrismaClient(appDatabaseUrl());
  /**
   * One connection for the process, not one per request.
   *
   * ProcurementService and TenantService each open a fresh `Connection.connect()` on every workflow
   * start and never close it — a gRPC channel leaked per call. Not replicated here; this one is
   * memoised and closed in onModuleDestroy (ADR-034 / Rule 39).
   */
  private temporal: { connection: Connection; client: Client } | null = null;

  constructor(
    private readonly stepUp: StepUpService,
    private readonly files: FileServiceClient,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
    if (this.temporal) await this.temporal.connection.close();
  }

  /**
   * Record a verified export request and hand it to the workflow.
   *
   * ORDER MATTERS: the action token is spent BEFORE the row is written. If the insert then fails the
   * subject has to re-verify — an annoyance. The other order fails the other way: a row that was
   * never authorised, already queued to gather every coordinate a person was recorded at, with the
   * token still live to try elsewhere. Costing someone one SMS beats writing an unauthorised export.
   *
   * There is deliberately no separate rate limit on this endpoint. Every request needs a fresh action
   * token and StepUpService already caps those at 10 per user per day, so a second counter here would
   * be a second thing to keep in step with the first.
   */
  async request(params: {
    tenantId: string;
    userId: string;
    actionToken: string;
    categories: ExportCategory[];
    format: ExportFormat;
    fromDate?: Date | null;
    toDate?: Date | null;
  }): Promise<ExportRequestView> {
    const { tenantId, userId, actionToken, categories, format } = params;
    assertSafeTenantId(tenantId);

    const verified = await this.stepUp.consume(actionToken, userId, 'data-export');
    if (!verified) {
      throw new ForbiddenException({
        error: {
          code: 'COS-PDPA-002',
          message: 'Step-up verification is required, has expired, or has already been used.',
          messageKey: 'pdpa.export.step_up_required',
        },
      });
    }

    const fromDate = params.fromDate ?? null;
    const toDate = params.toDate ?? null;
    // Checked here rather than in the DTO because it is a relation between two fields, and because an
    // inverted window silently returns an EMPTY export — which reads to the subject as "you hold
    // nothing about me", the most damaging wrong answer this feature can give.
    if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
      throw new UnprocessableEntityException({
        error: {
          code: 'COS-PDPA-003',
          message: 'The reporting window ends before it begins.',
          messageKey: 'pdpa.export.window_inverted',
        },
      });
    }

    const expiresAt = new Date(Date.now() + REQUEST_TTL_DAYS * 86_400_000);
    const rows = await this.prisma.$transaction(async (tx) => {
      await (tx as PrismaClient).$executeRawUnsafe(
        `SET LOCAL app.current_tenant_id = '${tenantId}'`,
      );
      return tx.$queryRaw<ExportRow[]>`
        INSERT INTO platform.export_requests
          (tenant_id, user_id, categories, format, from_date, to_date, expires_at)
        VALUES (
          ${tenantId}::uuid,
          ${userId}::uuid,
          ${categories}::text[],
          ${format}::platform."ExportFormat",
          ${fromDate}::date,
          ${toDate}::date,
          ${expiresAt}::timestamptz
        )
        RETURNING export_id, categories, format::text AS format, from_date, to_date,
                  status::text AS status, file_id, failure_reason,
                  requested_at, completed_at, expires_at
      `;
    });
    const row = rows[0]!;

    await this.startWorkflow(row.export_id, tenantId, userId);

    // Categories, never the data and never the window's contents (QM-8).
    logger.info({ userId, exportId: row.export_id, categories, format }, 'data export requested');
    return toView(row);
  }

  /**
   * The caller's own requests, newest first.
   *
   * Scoped by user_id on top of RLS, not instead of it: RLS confines the query to the tenant, and
   * within a tenant one employee's export requests are not another's business.
   */
  async list(tenantId: string, userId: string): Promise<ExportRequestView[]> {
    assertSafeTenantId(tenantId);
    const rows = await this.prisma.$transaction(async (tx) => {
      await (tx as PrismaClient).$executeRawUnsafe(
        `SET LOCAL app.current_tenant_id = '${tenantId}'`,
      );
      return tx.$queryRaw<ExportRow[]>`
        SELECT export_id, categories, format::text AS format, from_date, to_date,
               status::text AS status, file_id, failure_reason,
               requested_at, completed_at, expires_at
          FROM platform.export_requests
         WHERE user_id = ${userId}::uuid
         ORDER BY requested_at DESC
      `;
    });
    return rows.map(toView);
  }

  /**
   * Mint a fresh signed URL for a finished export.
   *
   * Every distinguishable failure gets its own status, because "download failed" on a subject-rights
   * artefact tells the person nothing about whether to wait, re-request, or complain:
   *
   *   404  no such request for this user
   *   422  still running, or it failed — `failureReason` says which
   *   410  the 7-day window closed; the archive is gone and a new request is the way back
   *   404  READY but File Service has no such object (deleted early, or another tenant's)
   *
   * A 409 from File Service (`FILE_NOT_CLEAN`) comes back as null too: uploads are scanned
   * asynchronously, so a just-finished archive is briefly PENDING_SCAN. That is a wait, not a fault.
   */
  async downloadUrl(
    tenantId: string,
    userId: string,
    exportId: string,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    assertSafeTenantId(tenantId);
    const rows = await this.prisma.$transaction(async (tx) => {
      await (tx as PrismaClient).$executeRawUnsafe(
        `SET LOCAL app.current_tenant_id = '${tenantId}'`,
      );
      return tx.$queryRaw<ExportRow[]>`
        SELECT export_id, categories, format::text AS format, from_date, to_date,
               status::text AS status, file_id, failure_reason,
               requested_at, completed_at, expires_at
          FROM platform.export_requests
         WHERE export_id = ${exportId}::uuid
           AND user_id   = ${userId}::uuid
      `;
    });

    const row = rows[0];
    if (!row) {
      throw new NotFoundException({
        error: { code: 'COS-PDPA-004', message: 'Export request not found.' },
      });
    }

    if (row.status !== 'READY' || !row.file_id) {
      // EXPIRED is reported as gone rather than not-ready: the difference decides whether the person
      // should wait or start again.
      if (row.status === 'EXPIRED') throw this.gone();
      throw new UnprocessableEntityException({
        error: {
          code: 'COS-PDPA-005',
          message:
            row.status === 'FAILED'
              ? (row.failure_reason ?? 'The export could not be produced.')
              : 'The export is still being prepared.',
          messageKey: 'pdpa.export.not_ready',
          details: { status: row.status },
        },
      });
    }

    if (row.expires_at.getTime() <= Date.now()) throw this.gone();

    const signed = await this.files.getSignedUrl(row.file_id);
    if (!signed) {
      throw new NotFoundException({
        error: {
          code: 'COS-PDPA-006',
          message: 'The export archive is not currently retrievable. Try again shortly.',
          messageKey: 'pdpa.export.archive_unavailable',
        },
      });
    }

    logger.info({ userId, exportId }, 'data export download link minted');
    // The TTL is File Service's to decide (SIGNED_URL_TTL_SECONDS), not ours — passed through so the
    // page can show a real countdown instead of a hard-coded "1 hour" that drifts from config.
    return { url: signed.url, expiresInSeconds: signed.expires_in_seconds };
  }

  private gone(): GoneException {
    return new GoneException({
      error: {
        code: 'COS-PDPA-007',
        message:
          'This export has expired and its archive has been deleted. Request a new export to receive the data again.',
        messageKey: 'pdpa.export.expired',
      },
    });
  }

  /**
   * Hand the request to Temporal.
   *
   * The workflow id is derived from the export id, so a retried start is a duplicate rather than a
   * second job gathering the same person's data twice.
   */
  private async startWorkflow(exportId: string, tenantId: string, userId: string): Promise<void> {
    const client = await this.temporalClient();
    await client.workflow.start('dataExportWorkflow', {
      taskQueue: DATA_EXPORT_TASK_QUEUE,
      workflowId: `data-export-${exportId}`,
      args: [{ export_id: exportId, tenant_id: tenantId, user_id: userId }],
    });
  }

  private async temporalClient(): Promise<Client> {
    if (!this.temporal) {
      const connection = await Connection.connect({
        address: process.env['TEMPORAL_ADDRESS'] ?? 'localhost:7233',
      });
      this.temporal = { connection, client: new Client({ connection }) };
    }
    return this.temporal.client;
  }
}
