// Reading a finished cash flow forecast.
//
// MOVED HERE FROM `backend/src/modules/finance/__tests__/cashflow-risk.service.spec.ts` on
// 2026-09-08, with the functions. They grade the alert the nightly sweep raises AND the card the
// FINANCE mobile home shows the person that alert is for, so they live in one client-safe package
// rather than in two implementations that can disagree about which week the money runs out.
//
// The backend spec keeps its own cases for the SWEEP — the lease, the event, the per-tenant scoping.
// What is here is the pure reading of a forecast, which is all the app needs and all that crossed
// the boundary.

import {
  firstShortfallWeek,
  gradeCashflowRisk,
  projectedShortfall,
  type CashflowPeriod,
} from '../cashflow';

/** A 13-week forecast whose cumulative_net first goes negative in `week`, or never when null. */
function forecastNegativeAt(week: number | null, depth = '-50000.0000'): CashflowPeriod[] {
  return Array.from({ length: 13 }, (_, i) => ({
    period_start: `2026-09-${String(i + 1).padStart(2, '0')}`,
    period_end: `2026-09-${String(i + 2).padStart(2, '0')}`,
    inflow: '0.0000',
    outflow: '0.0000',
    net_flow: '0.0000',
    cumulative_net: week !== null && i >= week ? depth : '10000.0000',
  }));
}

describe('firstShortfallWeek', () => {
  it('is null when the money never runs out inside the horizon', () => {
    expect(firstShortfallWeek(forecastNegativeAt(null))).toBeNull();
  });

  it('is the ZERO-BASED index of the first negative bucket', () => {
    // Zero-based on purpose, matching the array. A caller writing it for a reader adds one — and
    // this is the number the mobile card's "in week N" is built from, so an off-by-one here names
    // the wrong week on a finance screen.
    expect(firstShortfallWeek(forecastNegativeAt(0))).toBe(0);
    expect(firstShortfallWeek(forecastNegativeAt(3))).toBe(3);
  });

  it('finds the FIRST one, not the deepest', () => {
    const periods = forecastNegativeAt(2);
    periods[9]!.cumulative_net = '-9000000.0000';
    expect(firstShortfallWeek(periods)).toBe(2);
  });

  it('is null for an empty forecast rather than throwing', () => {
    // A project with nothing scheduled produces no buckets; the card must read that as "no
    // shortfall known", not as a crash on the finance home.
    expect(firstShortfallWeek([])).toBeNull();
  });
});

describe('gradeCashflowRisk — the band boundaries', () => {
  it('says nothing when the money never runs out inside the horizon', () => {
    expect(gradeCashflowRisk(forecastNegativeAt(null))).toBeNull();
  });

  // Each band is checked at BOTH edges. An off-by-one here moves a CRITICAL project into HIGH,
  // which is the difference between "act today" and "put it on the list".
  it.each([
    [0, 'CRITICAL'],
    [1, 'CRITICAL'],
    [2, 'HIGH'],
    [4, 'HIGH'],
    [5, 'MEDIUM'],
    [8, 'MEDIUM'],
    [9, 'LOW'],
    [12, 'LOW'],
  ])('first negative in week %i → %s', (week, expected) => {
    expect(gradeCashflowRisk(forecastNegativeAt(week as number))).toBe(expected);
  });

  it('grades on the FIRST negative week, not the deepest one', () => {
    // Negative early, then far deeper later. Risk is how soon the money runs out, not how much.
    const periods = forecastNegativeAt(1);
    periods[10]!.cumulative_net = '-9000000.0000';
    expect(gradeCashflowRisk(periods)).toBe('CRITICAL');
  });
});

describe('projectedShortfall', () => {
  it('is the deepest the hole gets, as a positive amount', () => {
    const periods = forecastNegativeAt(3, '-20000.0000');
    periods[7]!.cumulative_net = '-75000.0000';
    expect(projectedShortfall(periods).toFixed(4)).toBe('75000.0000');
  });

  it('is zero when the hole never opens', () => {
    expect(projectedShortfall(forecastNegativeAt(null)).toFixed(4)).toBe('0.0000');
  });

  it('is zero for an empty forecast', () => {
    expect(projectedShortfall([]).toFixed(4)).toBe('0.0000');
  });
});
