// Reading a direct-method cash flow forecast: when the money runs out, how deep the hole gets, and
// how bad that is.
//
// WHY THESE LIVE IN A CLIENT-SAFE PACKAGE. They were pure functions inside
// `backend/src/modules/finance/cashflow-risk.service.ts`, read by the nightly sweep that raises the
// alert. The FINANCE mobile home shows the same judgement to the person the alert is for — the
// drawing's "Projected shortfall of ฿450k in week 3" IS `projectedShortfall` and
// `firstShortfallWeek`, and its "Healthy" chip IS `gradeCashflowRisk` returning null.
//
// Reimplementing them in the app would put a financial rule in two places, and the failure mode is
// the one the backend's own header already names about the sweep and the screen: an alert that
// disagrees with the screen an operator opens to check it is worse than no alert. A phone that
// disagrees with both is worse again. Moved here on 2026-09-08 (FINANCE mobile UI) so there is one
// definition; `@cos/financial` is the home because these are money rules and it already owns
// `decimal.js`, and because Rule 34 lists it as client-safe — `apps/mobile` and the backend both
// depend on it already.
//
// THE FORECAST ITSELF IS NOT HERE. `buildForecast` stays in the backend: it reads rows shaped by the
// finance repository and no client builds one. Only the READING of a finished forecast is shared.

import { Decimal } from 'decimal.js';

/** One period bucket in a direct-method cash flow forecast. */
export interface CashflowPeriod {
  period_start: string;
  period_end: string;
  inflow: string;
  outflow: string;
  net_flow: string;
  cumulative_net: string;
}

export type CashflowRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * The index of the first bucket whose cumulative position is negative, or null when it never is.
 *
 * Exported in its own right because two callers need the ANSWER and not only the grade: the alert
 * bands below read it, and the mobile card prints the week it names ("in week 3"). Deriving that
 * index a second time at the call site is how the card and the grade would come to disagree about
 * which week they are talking about.
 *
 * ZERO-BASED, matching the array. A caller writing it for a reader adds one.
 */
export function firstShortfallWeek(periods: CashflowPeriod[]): number | null {
  const index = periods.findIndex((p) => new Decimal(p.cumulative_net).isNegative());
  return index === -1 ? null : index;
}

/**
 * The risk level for a forecast, or null when the money never runs out inside the horizon.
 *
 * Pure so the boundaries are testable without a database. The bands are inclusive of their lower
 * bound and read in weeks-from-now, matching how the buckets are numbered.
 */
export function gradeCashflowRisk(periods: CashflowPeriod[]): CashflowRiskLevel | null {
  const firstNegative = firstShortfallWeek(periods);
  if (firstNegative === null) return null;
  if (firstNegative <= 1) return 'CRITICAL';
  if (firstNegative <= 4) return 'HIGH';
  if (firstNegative <= 8) return 'MEDIUM';
  return 'LOW';
}

/** The deepest the hole gets across the horizon, as a positive amount. Zero when it never opens. */
export function projectedShortfall(periods: CashflowPeriod[]): Decimal {
  let worst = new Decimal(0);
  for (const p of periods) {
    const c = new Decimal(p.cumulative_net);
    if (c.lessThan(worst)) worst = c;
  }
  return worst.negated();
}
