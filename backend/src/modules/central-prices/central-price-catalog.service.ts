// CentralPriceCatalogService — the tenant-facing reads of the ราคากลาง catalog (ADR-061).
//
// Two callers: `GET /api/v1/central-prices` (every tenant role, read-only) and BoqService, which links
// BOQ lines to a central price. This is the module's public surface for other modules — the BOQ module
// never queries platform.central_price_catalog itself (master §4: cross-module data goes through the
// owning module's service).
//
// Runs on TenantPrismaService, i.e. as app_user inside the caller's tenant transaction. The catalog is
// RLS-exempt, and app_user holds SELECT only on it (migration 20260915000002), so nothing reachable from
// a tenant request can write a price. Tenants see ACTIVE rows only — is_active AND published_at IS NOT
// NULL — a pending or withdrawn price is never served and never linked.

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../tenant/prisma/tenant-prisma.service';
import { decodeCatalogCursor, encodeCatalogCursor } from './central-price-cursor';
import {
  afterCursor,
  CATALOG_COLUMNS,
  CATALOG_ORDER,
  catalogWhere,
  pageSize,
  toCentralPriceRow,
  type CatalogDbRow,
} from './central-price-queries';
import type { CentralPriceReference, CentralPriceSearchResponse } from './central-prices.types';

export interface CentralPriceSearch {
  q?: string;
  code?: string;
  cursor?: string;
  limit?: number;
}

@Injectable()
export class CentralPriceCatalogService {
  constructor(private readonly db: TenantPrismaService) {}

  /** Active, published rows matching `q` / `code`, paged by keyset cursor. */
  async searchPublished(search: CentralPriceSearch): Promise<CentralPriceSearchResponse> {
    const limit = pageSize(search.limit);
    const cursor = search.cursor ? decodeCatalogCursor(search.cursor) : undefined;
    const where = catalogWhere({ q: search.q, code: search.code, publishedOnly: true });

    const rows = await this.db.run((tx) =>
      tx.$queryRaw<CatalogDbRow[]>(Prisma.sql`
        SELECT ${CATALOG_COLUMNS}
          FROM platform.central_price_catalog c
         WHERE ${where} AND ${afterCursor(cursor)}
         ${CATALOG_ORDER}
         LIMIT ${limit + 1}
      `),
    );

    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      rows: page.map(toCentralPriceRow),
      next_cursor: rows.length > limit && last ? encodeCatalogCursor(last) : null,
    };
  }

  /**
   * The central price a BOQ line with this item code is linked to, or null.
   *
   * THE "LATEST PERIOD" RULE. Among the code's ACTIVE rows (is_active, published), the one with the
   * greatest effective_period under byte ("C") ordering; if two rows could ever tie, the most recently
   * published wins. effective_period is ADR-061's "year/version" text, so this is correct exactly when
   * periods are written so that text order is time order — `2568` < `2569`, `2569-01` < `2569-02` — which
   * is how the import documents them (central-prices README). Two things it deliberately does NOT do:
   * compare published_at first (a back-filled older period imported today would then displace the current
   * one), or parse the period (no period format is specified anywhere, and a parser would reject real
   * files on a guess).
   */
  async findReferencePrice(code: string): Promise<CentralPriceReference | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<CentralPriceReference[]>`
        SELECT c.price_id, c.code, c.unit, c.central_price::text AS central_price,
               c.currency_code, c.effective_period
          FROM platform.central_price_catalog c
         WHERE c.code = ${code}
           AND c.is_active
           AND c.published_at IS NOT NULL
         ORDER BY c.effective_period COLLATE "C" DESC, c.published_at DESC
         LIMIT 1
      `,
    );
    return rows[0] ?? null;
  }
}
