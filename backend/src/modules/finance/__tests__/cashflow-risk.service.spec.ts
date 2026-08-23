// CashflowRiskService — TDD OQ-50.
//
// The grading rule is a product decision (spec §32.4 #14), so the boundaries are what these tests
// are really protecting: a band that shifts by one week silently changes who gets paged and when.

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: mockInfo, warn: mockWarn, error: mockError, debug: jest.fn() }),
}));

jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
}));

jest.mock('../../../shared/prisma/create-prisma-client', () => ({
  createPrismaClient: () => ({ $queryRaw: mockQueryRaw, $disconnect: jest.fn() }),
}));

const mockInfo = jest.fn();
const mockWarn = jest.fn();
const mockError = jest.fn();
const mockQueryRaw = jest.fn();

import {
  CashflowRiskService,
  CASHFLOW_RISK_JOB,
  CASHFLOW_RISK_LEASE_SECONDS,
  gradeCashflowRisk,
  projectedShortfall,
} from '../cashflow-risk.service';
import type { CashflowPeriod } from '../finance.service';
import type { EventOutboxService } from '../../../shared/events/event-outbox.service';
import { makeLockDouble } from '../../../shared/scheduling/__tests__/lock-double';

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
});

describe('CashflowRiskService sweep', () => {
  const PROJECT = {
    project_id: 'proj-1',
    tenant_id: 'tenant-1',
    total_budget_currency: 'THB',
  };

  function build(granted = true) {
    const publish = jest.fn().mockResolvedValue(undefined);
    const outbox = { publish } as unknown as EventOutboxService;
    const lock = makeLockDouble(granted);
    return { svc: new CashflowRiskService(outbox, lock.service), publish, lock };
  }

  /** Queue the project list, then one project's inflows and outflows. */
  function queue(projects: unknown[], inflows: unknown[] = [], outflows: unknown[] = []) {
    mockQueryRaw
      .mockResolvedValueOnce(projects)
      .mockResolvedValueOnce(inflows)
      .mockResolvedValueOnce(outflows);
  }

  // mockReset, not clearAllMocks: the latter clears CALLS but leaves queued mockResolvedValueOnce
  // values behind, so a test that queues three and consumes one hands the leftovers to the next test.
  // That is exactly what happened — this suite passed in isolation and failed in the file.
  beforeEach(() => {
    mockQueryRaw.mockReset();
    mockInfo.mockReset();
    mockWarn.mockReset();
    mockError.mockReset();
  });

  it('emits for a project whose cumulative flow goes negative', async () => {
    const { svc, publish } = build();
    // 100k out next week against nothing coming in — negative from bucket 0.
    queue([PROJECT], [], [{ due_date: new Date(Date.now() + 3 * 86400e3), amount: '100000.0000' }]);

    await expect(svc.runRiskSweep()).resolves.toBe(1);

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'finance.cashflow_risk.detected.v1',
        tenant_id: 'tenant-1',
        // No human triggered this — the calendar did.
        actor_id: 'system',
        payload: expect.objectContaining({
          project_id: 'proj-1',
          risk_level: 'CRITICAL',
          detected_by: 'RULE_ENGINE',
          projected_shortfall: { amount: '100000.0000', currency_code: 'THB' },
        }),
      }),
    );
  });

  it('says nothing about a project that stays in the black', async () => {
    const { svc, publish } = build();
    queue([PROJECT], [{ due_date: new Date(Date.now() + 3 * 86400e3), amount: '500000.0000' }], []);

    await expect(svc.runRiskSweep()).resolves.toBe(0);
    expect(publish).not.toHaveBeenCalled();
  });

  // A project with no budget has no currency to denominate a shortfall in, and nobody has said what
  // it is supposed to cost. The query is what excludes it.
  it('grades only projects that have a budget', async () => {
    const { svc } = build();
    queue([], [], []);

    await svc.runRiskSweep();

    const sql = String((mockQueryRaw.mock.calls[0] as unknown[])[0]).replace(/\s+/g, ' ');
    expect(sql).toContain('FROM finance.project_budgets');
    expect(sql).toContain('t.is_active = true');
  });

  // One bad project must not cost every other project its grading for the day.
  it('carries on after a project fails', async () => {
    const { svc, publish } = build();
    // gradeProject issues its two queries with Promise.all, so BOTH are consumed per project even
    // when the first rejects — four calls after the project list, not three.
    mockQueryRaw
      .mockResolvedValueOnce([PROJECT, { ...PROJECT, project_id: 'proj-2' }])
      .mockRejectedValueOnce(new Error('boom')) // proj-1 inflows
      .mockResolvedValueOnce([]) // proj-1 outflows (still issued)
      .mockResolvedValueOnce([]) // proj-2 inflows
      .mockResolvedValueOnce([
        { due_date: new Date(Date.now() + 3 * 86400e3), amount: '100000.0000' },
      ]);

    await expect(svc.runRiskSweep()).resolves.toBe(1);
    expect(mockError).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: 'proj-1' }),
      'cashflow.risk.project_failed',
    );
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('leases the job so one replica sweeps, not three', async () => {
    const { svc, lock } = build();
    queue([], [], []);

    await svc.runRiskSweep();

    expect(lock.calls).toEqual([
      { jobName: CASHFLOW_RISK_JOB, leaseSeconds: CASHFLOW_RISK_LEASE_SECONDS },
    ]);
  });

  it('does nothing on a replica that lost the lease', async () => {
    const { svc, publish } = build(false);

    await expect(svc.runRiskSweep()).resolves.toBeNull();
    expect(mockQueryRaw).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});
