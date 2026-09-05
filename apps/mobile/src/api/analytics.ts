// Analytics API client — the executive dashboard read, and the one rule every caller of it gets wrong.
//
// `GET /api/v1/analytics/executive` TAKES `projectIds` AND RETURNS NOTHING WITHOUT THEM. The
// controller turns a missing query parameter into an empty array
// (`backend/src/modules/analytics/analytics.executive.controller.ts`), and the ClickHouse query
// filters `project_id IN ({projectIds:Array(UUID)})` — an empty IN matches no row, so the endpoint
// answers `200` with `[]`. On screen that is indistinguishable from being offline: every budget,
// variance and utilisation figure renders as an em dash.
//
// All three EXECUTIVE screens that read this endpoint called it with no parameters until 2026-09-05,
// so none of them had ever shown a real figure against a real backend. The blank Home dashboard in
// the first capture of `docs/screens/android/08-executive/` is what finally surfaced it.
//
// This module exists so the rule lives ONCE. Callers pass the ids they want and cannot forget,
// because there is no parameterless form to call.

import { get } from './client';

/**
 * One row of the executive dashboard, one project per row.
 *
 * DECIMAL fields are STRINGS, exactly as the API returned them — never parsed to a JS number. These
 * are the largest figures in the product (a portfolio budget in hundreds of millions of baht) and a
 * double's 2^-53 relative error stops being invisible there. Sum them with `@cos/financial`.
 */
export interface ExecutiveDashboardRow {
  projectId: string;
  totalCommitted: string;
  totalActual: string;
  totalBudget: string;
  utilizationPct: number;
  /**
   * 0 | 1, NOT a boolean. ClickHouse `if()` returns UInt8 and every consumer is written for that
   * (§35.13 ESC-34, where the product owner chose to fix the type rather than coerce the value).
   * Compare against 1; `atRisk === true` is never true.
   */
  atRisk: 0 | 1;
  overdueInvoiceCount: number;
}

/** A list endpoint that may answer `T[]` or `{ items: T[] }` — both shapes are in use. */
function asList<T>(res: { items?: T[] } | T[]): T[] {
  return Array.isArray(res) ? res : (res.items ?? []);
}

/**
 * The executive dashboard rows for the given projects.
 *
 * Returns `[]` for an empty id list WITHOUT calling the API: the request would answer `[]` anyway,
 * and not making it keeps "this executive has no projects" distinguishable from "the call failed"
 * in the caller's `.catch`.
 *
 * Throws when offline, like every other read in this app — the caller decides what an empty screen
 * says, and none of them may render a zero where a figure could not be fetched.
 */
export async function getExecutiveDashboard(
  projectIds: readonly string[],
): Promise<ExecutiveDashboardRow[]> {
  if (projectIds.length === 0) return [];
  // Repeated `projectIds=` keys — the array form NestJS's `@Query('projectIds')` collects. `get()`
  // takes a flat `Record<string, string>` and cannot express a repeated key, which is why the query
  // is built onto the path here rather than passed as params.
  const query = projectIds.map((id) => `projectIds=${encodeURIComponent(id)}`).join('&');
  const res = await get<ExecutiveDashboardRow[] | { items?: ExecutiveDashboardRow[] }>(
    `/analytics/executive?${query}`,
  );
  return asList(res);
}

/**
 * Severity of one row, by the mapping `alerts.tsx` has always used.
 *
 * `/analytics/executive` returns NO severity field. This is a documented derivation over three real
 * columns, and it is exported so the Home risk tile and the Alerts feed cannot drift apart:
 *   CRITICAL  utilisation over 100% — the budget is already spent
 *   HIGH      the row is flagged at-risk by the server's own threshold
 *   MEDIUM    invoices are overdue
 */
export type ExecutiveSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export const EXECUTIVE_SEVERITY_RANK: Record<ExecutiveSeverity, number> = {
  CRITICAL: 3,
  HIGH: 2,
  MEDIUM: 1,
  LOW: 0,
};

export function executiveSeverityOf(row: ExecutiveDashboardRow): ExecutiveSeverity {
  if (Number(row.utilizationPct) > 100) return 'CRITICAL';
  // === 1, not truthiness: `atRisk` is 0 | 1 and a bare `if (row.atRisk)` relies on the number being
  // falsy rather than saying what it means (§35.13 ESC-36).
  if (row.atRisk === 1) return 'HIGH';
  if (row.overdueInvoiceCount > 0) return 'MEDIUM';
  return 'LOW';
}
