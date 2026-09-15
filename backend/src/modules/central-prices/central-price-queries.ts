// SQL shared by the admin register and the tenant lookup, and the row mappers both use.
//
// One builder, two connections: the admin service runs it on the platform connection, the tenant read on
// TenantPrismaService (app_user, which holds SELECT only on the catalog). Keeping the WHERE/ORDER/cursor
// text in one place is what keeps the two listings paging identically.
//
// Every value is a bound parameter (QM-4). `q` is matched with ILIKE, so its own `%`, `_` and `\` are
// escaped first — otherwise a search for "10%" would match everything starting with "10".

import { Prisma } from '@prisma/client';
import type { CatalogCursor } from './central-price-cursor';
import { centralPriceStatus } from './central-price-rows';
import type {
  CentralPriceRow,
  CentralPriceSource,
  SyncRun,
  SyncRunKind,
  SyncRunOutcome,
} from './central-prices.types';

export const PAGE_DEFAULT = 50;
export const PAGE_MAX = 200;

/** A catalog row exactly as the SELECT below returns it. */
export interface CatalogDbRow {
  price_id: string;
  code: string;
  description: string;
  category: string | null;
  unit: string;
  central_price: string;
  currency_code: string;
  effective_period: string;
  source: CentralPriceSource;
  source_ref: string | null;
  published_at: Date | null;
  is_active: boolean;
}

/** central_price is cast to text so the four stored decimals reach the caller untouched. */
export const CATALOG_COLUMNS = Prisma.sql`
  c.price_id, c.code, c.description, c.category, c.unit, c.central_price::text AS central_price,
  c.currency_code, c.effective_period, c.source, c.source_ref, c.published_at, c.is_active
`;

export interface CatalogFilters {
  /** Substring of code or description, case-insensitive. */
  q?: string;
  /** Exact code. */
  code?: string;
  category?: string;
  effective_period?: string;
  /** Only rows a tenant may see: active and published. */
  publishedOnly?: boolean;
}

/** Escape LIKE metacharacters so user text matches literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export function catalogWhere(filters: CatalogFilters): Prisma.Sql {
  const conds: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (filters.publishedOnly) conds.push(Prisma.sql`c.is_active AND c.published_at IS NOT NULL`);
  if (filters.code) conds.push(Prisma.sql`c.code = ${filters.code}`);
  if (filters.category) conds.push(Prisma.sql`c.category = ${filters.category}`);
  if (filters.effective_period) {
    conds.push(Prisma.sql`c.effective_period = ${filters.effective_period}`);
  }
  if (filters.q) {
    const pattern = `%${escapeLike(filters.q)}%`;
    conds.push(Prisma.sql`(c.code ILIKE ${pattern} OR c.description ILIKE ${pattern})`);
  }
  return Prisma.join(conds, ' AND ');
}

/** Rows strictly after the cursor in (code ASC, effective_period DESC, price_id ASC) order. */
export function afterCursor(cursor: CatalogCursor | undefined): Prisma.Sql {
  if (!cursor) return Prisma.sql`TRUE`;
  return Prisma.sql`(
    c.code COLLATE "C" > ${cursor.code}::text COLLATE "C"
    OR (c.code = ${cursor.code}::text AND (
      c.effective_period COLLATE "C" < ${cursor.effective_period}::text COLLATE "C"
      OR (c.effective_period = ${cursor.effective_period}::text AND c.price_id > ${cursor.price_id}::uuid)
    ))
  )`;
}

export const CATALOG_ORDER = Prisma.sql`
  ORDER BY c.code COLLATE "C" ASC, c.effective_period COLLATE "C" DESC, c.price_id ASC
`;

/** Clamp a requested page size into 1..PAGE_MAX, defaulting to PAGE_DEFAULT. */
export function pageSize(limit: number | undefined): number {
  if (limit === undefined) return PAGE_DEFAULT;
  return Math.min(Math.max(Math.trunc(limit), 1), PAGE_MAX);
}

export function toCentralPriceRow(row: CatalogDbRow): CentralPriceRow {
  return {
    price_id: row.price_id,
    code: row.code,
    description: row.description,
    category: row.category,
    unit: row.unit,
    central_price: row.central_price,
    currency_code: row.currency_code,
    effective_period: row.effective_period,
    source: row.source,
    source_ref: row.source_ref,
    published_at: row.published_at ? row.published_at.toISOString() : null,
    is_active: row.is_active,
    status: centralPriceStatus(row.is_active, row.published_at),
  };
}

/** A sync run exactly as `SELECT *` returns it. */
export interface SyncRunDbRow {
  run_id: string;
  kind: SyncRunKind;
  source_name: string;
  effective_period: string | null;
  started_at: Date;
  finished_at: Date;
  outcome: SyncRunOutcome;
  records_total: number;
  records_inserted: number;
  records_updated: number;
  records_rejected: number;
  error_code: string | null;
  error_message: string | null;
  actor_id: string | null;
}

export function toSyncRun(row: SyncRunDbRow): SyncRun {
  return {
    ...row,
    started_at: row.started_at.toISOString(),
    finished_at: row.finished_at.toISOString(),
  };
}
