// Keyset cursor for the catalog listings.
//
// Both listings order by (code ASC, effective_period DESC, price_id ASC), every comparison under
// COLLATE "C" so the SQL ORDER BY and the cursor predicate agree byte for byte — under a linguistic
// collation Thai and mixed-case codes can sort one way in ORDER BY and compare another way in a WHERE,
// which skips or repeats rows at page boundaries. The cursor is the last row's three keys; it is opaque
// to the caller (base64url JSON) and validated on the way back in.

import { UUID_PATTERN } from '../../shared/prisma/assert-safe-tenant-id';
import { invalidCursor } from './central-price-errors';

export interface CatalogCursor {
  code: string;
  effective_period: string;
  price_id: string;
}

export function encodeCatalogCursor(row: CatalogCursor): string {
  return Buffer.from(
    JSON.stringify([row.code, row.effective_period, row.price_id]),
    'utf8',
  ).toString('base64url');
}

/** Decode a cursor this API issued. Anything else is a 400 (COS-CPRICE-005), never a 500. */
export function decodeCatalogCursor(cursor: string): CatalogCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 3 ||
    !parsed.every((v) => typeof v === 'string') ||
    !UUID_PATTERN.test(parsed[2] as string)
  ) {
    throw invalidCursor();
  }
  const [code, effective_period, price_id] = parsed as [string, string, string];
  return { code, effective_period, price_id };
}
