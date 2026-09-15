// Admin Audit Log Service — the SYSTEM_ADMIN reads over platform.audit_logs (R17.4 per tenant, R17.6
// across tenants; §6.7 "read all tenant audit logs"; product-owner decisions D3 and D4, 2026-09-15).
//
// THE READ IS ITSELF AUDITED (§20.4.6, D3). Every list, summary and export writes one audit_logs row —
// action `audit.read` or `audit.export`, resource_type `audit_log`, the filters in metadata — IN THE
// SAME TRANSACTION as the read. The SELECT runs first, so the page does not contain its own audit row,
// and the INSERT runs before COMMIT, so a read that cannot be audited returns nothing: the exception
// propagates and the rows never leave this service (§6.7 "No System Admin action is silent").
//
// HOW RLS IS HANDLED — read this before changing the connection.
// platform.audit_logs has FORCE ROW LEVEL SECURITY with exactly two policies, both `TO app_user`
// (migration 20260608000004_rls_policies): SELECT and INSERT where tenant_id = app.current_tenant_id.
// A cross-tenant SELECT is therefore impossible as app_user, by design, and nothing here weakens that.
// This service reads on the PLATFORM connection — `createPrismaClient()`, DATABASE_URL — which is the
// bootstrap role that bypasses RLS (app-database-url.ts). That is the existing mechanism for work that
// must span tenants: TenantService (whose writeAdminAudit this mirrors), TombstonePruneService and the
// notification escalation sweeps all run on it for the same reason. No migration and no new role.
//
// Because a wrong connection would not fail but silently return ONE tenant's rows (or none), every
// read first asks PostgreSQL whether the current role bypasses RLS, and refuses with 503 when it does
// not. A cross-tenant audit trail that quietly omits tenants would tell the operator something false.
// The GUC is still SET LOCAL before the audit INSERT, exactly as writeAdminAudit does, so the write
// also passes rls_audit_insert's WITH CHECK should it ever run as app_user.
//
// Every filter is a bound parameter (QM-4). The only interpolated value is the tenant id in SET LOCAL
// — a GUC cannot be bound — and it is UUID-validated first.

import type { AuditLogPage, AuditLogRow, AuditLogSummary, TenantAuditLogPage } from '@cos/types';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createLogger } from '@cos/logger';
import { createPrismaClient } from '../../shared/prisma/create-prisma-client';
import { assertSafeTenantId, UUID_PATTERN } from '../../shared/prisma/assert-safe-tenant-id';
import { AUDIT_PAGE_DEFAULT } from './dto/audit-log-query.dto';

const logger = createLogger('admin-audit-log-service');

/**
 * Most rows one export returns. 50 000 rows at the ~0.5 KB a row serialises to is ~25 MB built in
 * memory — the ceiling for a synchronous download. The export fetches one row more to KNOW it was cut,
 * and says so (`truncated`), rather than handing over a partial trail that looks complete.
 */
export const AUDIT_EXPORT_ROW_CAP = 50_000;

/** An export reads up to AUDIT_EXPORT_ROW_CAP rows inside its transaction; Prisma's 5 s default is too short. */
const EXPORT_TX_TIMEOUT_MS = 60_000;

export type { AuditLogPage, AuditLogRow, AuditLogSummary, TenantAuditLogPage } from '@cos/types';

export interface AuditLogExport {
  rows: AuditLogRow[];
  row_cap: number;
  /** True when more rows matched than row_cap; `rows` holds the newest row_cap of them. */
  truncated: boolean;
}

export interface AuditLogFilters {
  tenantId?: string;
  actorId?: string;
  action?: string;
  from?: string;
  to?: string;
  q?: string;
}

export interface AuditLogPaging {
  cursor?: string;
  limit?: number;
}

type AuditReadAction = 'audit.read' | 'audit.export';
type AuditView = 'list' | 'summary' | 'export';
type Tx = Prisma.TransactionClient;

interface RawAuditRow {
  log_id: string;
  occurred_at: Date;
  occurred_at_key: string;
  tenant_id: string;
  tenant_code: string;
  tenant_name: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  actor_id: string;
  actor_email: string | null;
  actor_name: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: unknown;
}

// ── cursor ──────────────────────────────────────────────────────────────────

/** occurred_at exactly as PostgreSQL stores it: microseconds, UTC. */
const CURSOR_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

/**
 * Encode a keyset position — base64url of `<occurred_at>|<log_id>`.
 *
 * NOT shared/pagination/cursor.ts. That codec carries a JS Date, which holds milliseconds, while
 * occurred_at is a timestamptz with MICROSECONDS. Rounding the boundary down to the millisecond makes
 * `(occurred_at, log_id) < boundary` skip every row that falls between the rounded and the real value
 * — rows a burst of audited actions writes within one millisecond. The boundary here is the database's
 * own text rendering of the value (`occurred_at_key` in the SELECT), so it compares exactly.
 */
export function encodeAuditCursor(occurredAtKey: string, logId: string): string {
  return Buffer.from(`${occurredAtKey}|${logId}`, 'utf8').toString('base64url');
}

/** Decode a cursor from encodeAuditCursor; null for anything that is not one. */
export function decodeAuditCursor(cursor: string): { occurredAt: string; logId: string } | null {
  const [occurredAt, logId, ...rest] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  if (rest.length > 0 || !occurredAt || !logId) return null;
  if (!CURSOR_TIMESTAMP.test(occurredAt) || !UUID_PATTERN.test(logId)) return null;
  // The shape alone admits 2026-02-30T99:99:99 — PostgreSQL would refuse its ::timestamptz cast mid-read, as a 500.
  // A real instant renders back to the same text to the millisecond; anything that rolls over is not one.
  const instant = new Date(occurredAt);
  if (Number.isNaN(instant.getTime()) || instant.toISOString() !== `${occurredAt.slice(0, 23)}Z`)
    return null;
  return { occurredAt, logId };
}

// ── row shaping ─────────────────────────────────────────────────────────────

/**
 * A URL that could open a connection: any `scheme://user:password@…`, and any postgres URL at all.
 * metadata holds ids and the justification by design (writeAdminAudit audits the dedicated DB's HOST,
 * never its URL), but a justification is free text an operator could paste a connection string into.
 * This is the backstop that keeps such a string off the wire.
 */
const CREDENTIAL_URL = /(?:[a-z][a-z0-9+.-]*:\/\/[^\s/@:]*:[^\s/@]*@|postgres(?:ql)?:\/\/)\S*/gi;

export function redactCredentialUrls(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(CREDENTIAL_URL, '[REDACTED]');
  if (Array.isArray(value)) return value.map(redactCredentialUrls);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactCredentialUrls(v)]));
  }
  return value;
}

function toAuditLogRow(raw: RawAuditRow): AuditLogRow {
  const redacted = redactCredentialUrls(raw.metadata);
  // metadata is jsonb and written as an object by every writer; a scalar or array is kept, wrapped,
  // rather than dropped — an audit read must not hide what the row holds.
  const metadata: Record<string, unknown> =
    redacted === null || redacted === undefined
      ? {}
      : typeof redacted === 'object' && !Array.isArray(redacted)
        ? (redacted as Record<string, unknown>)
        : { value: redacted };
  const justification = metadata['justification'];
  return {
    log_id: raw.log_id,
    occurred_at: raw.occurred_at.toISOString(),
    tenant_id: raw.tenant_id,
    tenant_code: raw.tenant_code,
    tenant_name: raw.tenant_name,
    action: raw.action,
    resource_type: raw.resource_type,
    resource_id: raw.resource_id,
    actor_id: raw.actor_id,
    actor_email: raw.actor_email,
    actor_name: raw.actor_name,
    ip_address: raw.ip_address,
    user_agent: raw.user_agent,
    justification:
      typeof justification === 'string' && justification.trim() !== '' ? justification : null,
    metadata,
  };
}

/**
 * Escape LIKE's metacharacters so user input matches literally, paired with `ESCAPE '!'`.
 *
 * `!`, not the conventional backslash: Prisma.sql drops a backslash written in the template text
 * (measured 2026-09-15 on @prisma/client 7.8.0 — `ESCAPE '\\'` came out as `ESCAPE ''`), and an empty
 * escape silently turns every `%` and `_` in the user's search back into a wildcard.
 */
function likeLiteral(s: string): string {
  return s.replace(/[!%_]/g, (c) => `!${c}`);
}

function parseInstant(value: string | undefined, name: 'from' | 'to'): Date | null {
  if (value === undefined) return null;
  const d = new Date(value);
  // IsISO8601 admits forms Date cannot read (week dates, ordinal dates); refuse them here.
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`${name} must be an ISO 8601 date or date-time`);
  }
  return d;
}

@Injectable()
export class AdminAuditLogService implements OnModuleDestroy {
  // Platform PrismaClient — NOT TenantPrismaService and NOT APP_DATABASE_URL. See "HOW RLS IS HANDLED".
  private readonly prisma = createPrismaClient();

  /** Close the Prisma connection on shutdown (Rule 39). */
  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }

  // ── R17.4 — one tenant ────────────────────────────────────────────────────

  /**
   * One page of a tenant's audit trail, newest first, plus its 30-day count. Audited as `audit.read`
   * against THAT tenant. 404 when the tenant does not exist.
   */
  async listTenantAuditLogs(
    tenantId: string,
    actorId: string,
    paging: AuditLogPaging & Pick<AuditLogFilters, 'q'>,
  ): Promise<TenantAuditLogPage> {
    const filters: AuditLogFilters = { tenantId, q: paging.q };
    return this.audited(
      { tenantId, actorId, action: 'audit.read', view: 'list', scope: 'tenant', filters, paging },
      async (tx) => {
        await this.assertTenantExists(tx, tenantId);
        const page = await this.readPage(tx, filters, paging);
        const [count] = await tx.$queryRaw<Array<{ n: bigint }>>`
          SELECT count(*) AS n FROM platform.audit_logs
           WHERE tenant_id = ${tenantId}::uuid
             AND occurred_at >= now() - interval '30 days'
        `;
        return { ...page, summary: { total_30d: Number(count!.n) } };
      },
    );
  }

  /** A tenant's full trail matching `q`, newest first, capped. Audited as `audit.export`. */
  async exportTenantAuditLogs(
    tenantId: string,
    actorId: string,
    search: Pick<AuditLogFilters, 'q'>,
  ): Promise<AuditLogExport> {
    const filters: AuditLogFilters = { tenantId, q: search.q };
    return this.audited(
      {
        tenantId,
        actorId,
        action: 'audit.export',
        view: 'export',
        scope: 'tenant',
        filters,
        format: 'csv',
      },
      async (tx) => {
        await this.assertTenantExists(tx, tenantId);
        return this.readExport(tx, filters);
      },
      EXPORT_TX_TIMEOUT_MS,
    );
  }

  // ── R17.6 — across tenants ────────────────────────────────────────────────

  /**
   * One page across every tenant, newest first, filtered. Audited as `audit.read` — against the
   * `tenantId` filter's tenant when one is given (404 if it does not exist), otherwise against the
   * caller's own tenant, since a read that spans tenants has no single target.
   */
  async listAuditLogs(
    callerTenantId: string,
    actorId: string,
    query: AuditLogFilters & AuditLogPaging,
  ): Promise<AuditLogPage> {
    const { cursor, limit, ...filters } = query;
    return this.audited(
      {
        tenantId: filters.tenantId ?? callerTenantId,
        actorId,
        action: 'audit.read',
        view: 'list',
        scope: 'global',
        filters,
        paging: { cursor, limit },
      },
      async (tx) => {
        if (filters.tenantId) await this.assertTenantExists(tx, filters.tenantId);
        return this.readPage(tx, filters, { cursor, limit });
      },
    );
  }

  /**
   * The Global Audit Log cards. Exactly what each figure counts, over ALL tenants:
   *
   * - `total` — rows with occurred_at in [from, to); every row when neither is given.
   * - `today` — rows with occurred_at at or after 00:00 UTC of the current day. Ignores from / to.
   * - `with_justification` — rows in [from, to) whose action starts with `tenant.` (the audited
   *   SYSTEM_ADMIN tenant actions) and whose metadata.justification is present and not blank.
   * - `privileged` — rows in [from, to) whose action starts with `tenant.`: the denominator of
   *   `with_justification`.
   * - `privileged_7d` — rows whose action starts with `tenant.` and occurred_at is within the last
   *   7 × 24 h before now. Ignores from / to.
   *
   * Audit reads (`audit.*`) are rows like any other and are counted in `total` and `today`.
   * Audited as `audit.read` against the caller's own tenant.
   */
  async summarizeAuditLogs(
    callerTenantId: string,
    actorId: string,
    window: Pick<AuditLogFilters, 'from' | 'to'>,
  ): Promise<AuditLogSummary> {
    const filters: AuditLogFilters = { from: window.from, to: window.to };
    return this.audited(
      {
        tenantId: callerTenantId,
        actorId,
        action: 'audit.read',
        view: 'summary',
        scope: 'global',
        filters,
      },
      async (tx) => {
        const inWindow = this.windowCondition(filters);
        const [row] = await tx.$queryRaw<
          Array<{
            total: bigint;
            today: bigint;
            with_justification: bigint;
            privileged: bigint;
            privileged_7d: bigint;
          }>
        >`
          SELECT
            count(*) FILTER (WHERE ${inWindow}) AS total,
            count(*) FILTER (
              WHERE a.occurred_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
            ) AS today,
            count(*) FILTER (
              WHERE ${inWindow}
                AND a.action LIKE 'tenant.%'
                AND NULLIF(btrim(a.metadata->>'justification'), '') IS NOT NULL
            ) AS with_justification,
            count(*) FILTER (WHERE ${inWindow} AND a.action LIKE 'tenant.%') AS privileged,
            count(*) FILTER (
              WHERE a.action LIKE 'tenant.%' AND a.occurred_at >= now() - interval '7 days'
            ) AS privileged_7d
          FROM platform.audit_logs a
        `;
        return {
          total: Number(row!.total),
          today: Number(row!.today),
          with_justification: Number(row!.with_justification),
          privileged: Number(row!.privileged),
          privileged_7d: Number(row!.privileged_7d),
        };
      },
    );
  }

  /** Every row across tenants matching the filters, newest first, capped. Audited as `audit.export`. */
  async exportAuditLogs(
    callerTenantId: string,
    actorId: string,
    filters: AuditLogFilters,
    format: 'csv' | 'json',
  ): Promise<AuditLogExport> {
    return this.audited(
      {
        tenantId: filters.tenantId ?? callerTenantId,
        actorId,
        action: 'audit.export',
        view: 'export',
        scope: 'global',
        filters,
        format,
      },
      async (tx) => {
        if (filters.tenantId) await this.assertTenantExists(tx, filters.tenantId);
        return this.readExport(tx, filters);
      },
      EXPORT_TX_TIMEOUT_MS,
    );
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /**
   * Run `read`, then write its audit row, in one transaction. See the file header for why the order
   * is read → audit and why a failed audit discards the read.
   */
  private async audited<T>(
    entry: {
      tenantId: string;
      actorId: string;
      action: AuditReadAction;
      view: AuditView;
      scope: 'tenant' | 'global';
      filters: AuditLogFilters;
      paging?: AuditLogPaging;
      format?: 'csv' | 'json';
    },
    read: (tx: Tx) => Promise<T>,
    timeout?: number,
  ): Promise<T> {
    // A read nobody can be named for cannot be audited — refuse before touching the database. The
    // tenant id is also what SET LOCAL interpolates, so it is validated as a UUID (QM-4).
    if (!UUID_PATTERN.test(entry.actorId)) {
      throw new UnauthorizedException('Missing actor identity');
    }
    assertSafeTenantId(entry.tenantId);
    // Validated before the transaction opens, so a malformed request costs no connection.
    this.windowCondition(entry.filters);
    if (entry.paging?.cursor !== undefined && decodeAuditCursor(entry.paging.cursor) === null) {
      throw new BadRequestException('cursor is not a cursor this endpoint issued');
    }

    const metadata = {
      scope: entry.scope,
      view: entry.view,
      filters: {
        tenant_id: entry.filters.tenantId ?? null,
        actor_id: entry.filters.actorId ?? null,
        action: entry.filters.action ?? null,
        from: entry.filters.from ?? null,
        to: entry.filters.to ?? null,
        q: entry.filters.q ? entry.filters.q : null,
      },
      ...(entry.paging
        ? {
            limit: entry.paging.limit ?? AUDIT_PAGE_DEFAULT,
            after_cursor: entry.paging.cursor !== undefined,
          }
        : {}),
      ...(entry.format ? { format: entry.format } : {}),
    };

    return this.prisma.$transaction(
      async (tx) => {
        await this.assertBypassesRls(tx);
        const result = await read(tx);
        await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${entry.tenantId}'`);
        await tx.$executeRaw`
          INSERT INTO platform.audit_logs (tenant_id, actor_id, action, resource_type, resource_id, metadata)
          VALUES (
            ${entry.tenantId}::uuid,
            ${entry.actorId}::uuid,
            ${entry.action},
            'audit_log',
            NULL,
            ${JSON.stringify(metadata)}::jsonb
          )
        `;
        return result;
      },
      timeout === undefined ? undefined : { timeout },
    );
  }

  /** 503 unless this connection's role bypasses RLS — see "HOW RLS IS HANDLED". */
  private async assertBypassesRls(tx: Tx): Promise<void> {
    const [role] = await tx.$queryRaw<Array<{ bypass: boolean }>>`
      SELECT (rolsuper OR rolbypassrls) AS bypass FROM pg_roles WHERE rolname = current_user
    `;
    if (role?.bypass !== true) {
      logger.error(
        { event: 'admin_audit.connection_subject_to_rls' },
        'Audit logs cannot be read across tenants on a connection subject to RLS',
      );
      throw new ServiceUnavailableException('Audit logs cannot be read on this connection');
    }
  }

  private async assertTenantExists(tx: Tx, tenantId: string): Promise<void> {
    const found = await tx.$queryRaw<Array<{ tenant_id: string }>>`
      SELECT tenant_id FROM platform.tenants WHERE tenant_id = ${tenantId}::uuid LIMIT 1
    `;
    if (found.length === 0) throw new NotFoundException(`Tenant ${tenantId} not found`);
  }

  /** `a.occurred_at` within [from, to); TRUE when neither bound is given. 400 on from > to. */
  private windowCondition(filters: Pick<AuditLogFilters, 'from' | 'to'>): Prisma.Sql {
    const from = parseInstant(filters.from, 'from');
    const to = parseInstant(filters.to, 'to');
    if (from && to && from.getTime() > to.getTime()) {
      throw new BadRequestException('from must not be later than to');
    }
    const parts: Prisma.Sql[] = [];
    if (from) parts.push(Prisma.sql`a.occurred_at >= ${from.toISOString()}::timestamptz`);
    if (to) parts.push(Prisma.sql`a.occurred_at < ${to.toISOString()}::timestamptz`);
    return parts.length > 0 ? Prisma.join(parts, ' AND ') : Prisma.sql`TRUE`;
  }

  private whereClause(
    filters: AuditLogFilters,
    after: { occurredAt: string; logId: string } | null,
  ): Prisma.Sql {
    const conds: Prisma.Sql[] = [this.windowCondition(filters)];
    if (filters.tenantId) conds.push(Prisma.sql`a.tenant_id = ${filters.tenantId}::uuid`);
    if (filters.actorId) conds.push(Prisma.sql`a.actor_id = ${filters.actorId}::uuid`);
    if (filters.action) {
      conds.push(
        filters.action.endsWith('.')
          ? Prisma.sql`a.action LIKE ${likeLiteral(filters.action) + '%'} ESCAPE '!'`
          : Prisma.sql`a.action = ${filters.action}`,
      );
    }
    if (filters.q) {
      const pattern = `%${likeLiteral(filters.q)}%`;
      conds.push(Prisma.sql`(
        a.action ILIKE ${pattern} ESCAPE '!'
        OR u.email ILIKE ${pattern} ESCAPE '!'
        OR (a.metadata->>'justification') ILIKE ${pattern} ESCAPE '!'
      )`);
    }
    if (after) {
      conds.push(
        Prisma.sql`(a.occurred_at, a.log_id) < (${after.occurredAt}::timestamptz, ${after.logId}::uuid)`,
      );
    }
    return Prisma.join(conds, ' AND ');
  }

  private selectRows(tx: Tx, where: Prisma.Sql, take: number): Promise<RawAuditRow[]> {
    return tx.$queryRaw<RawAuditRow[]>`
      SELECT a.log_id::text AS log_id,
             a.occurred_at,
             to_char(a.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS occurred_at_key,
             a.tenant_id::text AS tenant_id,
             t.tenant_code,
             t.tenant_name,
             a.action,
             a.resource_type,
             a.resource_id::text AS resource_id,
             a.actor_id::text AS actor_id,
             u.email AS actor_email,
             u.display_name AS actor_name,
             host(a.ip_address) AS ip_address,
             a.user_agent,
             a.metadata
        FROM platform.audit_logs a
        JOIN platform.tenants t ON t.tenant_id = a.tenant_id
        LEFT JOIN platform.users u ON u.user_id = a.actor_id
       WHERE ${where}
       ORDER BY a.occurred_at DESC, a.log_id DESC
       LIMIT ${take}
    `;
  }

  private async readPage(
    tx: Tx,
    filters: AuditLogFilters,
    paging: AuditLogPaging,
  ): Promise<AuditLogPage> {
    const limit = paging.limit ?? AUDIT_PAGE_DEFAULT;
    const after = paging.cursor === undefined ? null : decodeAuditCursor(paging.cursor);
    // limit + 1: the probe row answers "is there an older page?" without a count.
    const raw = await this.selectRows(tx, this.whereClause(filters, after), limit + 1);
    const kept = raw.slice(0, limit);
    const last = kept[kept.length - 1];
    return {
      rows: kept.map(toAuditLogRow),
      next_cursor:
        raw.length > limit && last ? encodeAuditCursor(last.occurred_at_key, last.log_id) : null,
    };
  }

  private async readExport(tx: Tx, filters: AuditLogFilters): Promise<AuditLogExport> {
    const raw = await this.selectRows(
      tx,
      this.whereClause(filters, null),
      AUDIT_EXPORT_ROW_CAP + 1,
    );
    return {
      rows: raw.slice(0, AUDIT_EXPORT_ROW_CAP).map(toAuditLogRow),
      row_cap: AUDIT_EXPORT_ROW_CAP,
      truncated: raw.length > AUDIT_EXPORT_ROW_CAP,
    };
  }
}
