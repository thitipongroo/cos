// Safety cap for list queries that have no pagination contract.
//
// THE PROBLEM
// -----------
// Many `list*` repository methods ran `SELECT * … WHERE tenant_id = $1` with no LIMIT, so the row
// count grew with the tenant's data forever. One large customer turns `GET /workers` or
// `GET /master-data/materials` into a query that loads the whole table into the Node heap and
// serialises it into a single response.
//
// WHY A CAP AND NOT PAGINATION
// ----------------------------
// These endpoints return a bare JSON array today. Converting them to the §14 paginated envelope
// ({data, meta, pagination}) is a breaking contract change for every existing caller — web, mobile
// and the OpenAPI files — and belongs in a versioned API change, not a bug fix. A cap bounds the
// damage without altering the response type. `ProjectRepository.listByMember` already uses exactly
// this idiom ("unpaginated — capped at 100 as a guard"), so this generalises an existing decision
// rather than inventing one.
//
// NEVER USE THIS ON A QUERY THAT FEEDS A CALCULATION
// -------------------------------------------------
// A truncated list is a visibly short list; a truncated SUM is a wrong number that looks right.
// BoqRepository.findItemsByVersion / findCategoriesByVersion feed recalculateVersionTotal, so they
// are deliberately left uncapped — a LIMIT there would silently understate a project's cost.
// Cap only queries whose rows are handed to a client as a list.

import { createLogger } from '@cos/logger';

const logger = createLogger('list-cap');

/**
 * Default ceiling for an unpaginated list. High enough that no realistic tenant reaches it during
 * normal use, low enough that hitting it cannot exhaust the heap.
 */
export const LIST_CAP = 1000;

/**
 * The value to pass as the SQL `LIMIT` — one MORE than the cap.
 *
 * Fetching cap+1 is what makes truncation detectable: if the extra row comes back, more rows exist.
 * Selecting exactly `cap` cannot distinguish "exactly cap rows" from "cap rows and counting".
 */
export function capLimit(cap: number = LIST_CAP): number {
  return cap + 1;
}

/**
 * Trim a cap+1 result set down to the cap, logging when rows were dropped.
 *
 * The log line is the point. A silent cap turns "you have 4,000 workers" into "you have 1,000
 * workers" with nothing anywhere to say otherwise, which is how a truncating list becomes a
 * data-loss bug report months later. `resource` names the query so the warning is actionable.
 */
export function applyCap<T>(rows: T[], resource: string, cap: number = LIST_CAP): T[] {
  if (rows.length <= cap) return rows;
  logger.warn(
    { resource, cap, returned: cap },
    'list-cap: result truncated — this endpoint is unpaginated and the tenant has outgrown the cap',
  );
  return rows.slice(0, cap);
}
