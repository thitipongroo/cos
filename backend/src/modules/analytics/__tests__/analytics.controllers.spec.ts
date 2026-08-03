// Analytics Controllers — unit tests
// Tests that each controller delegates correctly to AnalyticsService.

import { AnalyticsExecutiveController } from '../analytics.executive.controller';
import { AnalyticsPmController } from '../analytics.pm.controller';
import { AnalyticsTrendsController } from '../analytics.trends.controller';

// Project-scope stand-in: passes ids through, i.e. a role §6.5 does not place under project scope.
// The filtering behaviour itself is covered in analytics-project-scope.service.spec.ts.
const makeScope = (ids?: string[]) => ({
  filterVisibleProjectIds: jest.fn((requested: string[]) => Promise.resolve(ids ?? requested)),
});

const makeSvc = () => ({
  getExecutiveDashboard: jest.fn().mockResolvedValue([]),
  getPmDashboard: jest.fn().mockResolvedValue([]),
  getCostTrend: jest.fn().mockResolvedValue([]),
  getProcurementTrend: jest.fn().mockResolvedValue([]),
  getSiteTrend: jest.fn().mockResolvedValue([]),
  invalidate: jest.fn().mockResolvedValue(undefined),
});

describe('AnalyticsExecutiveController', () => {
  it('delegates to svc.getExecutiveDashboard with parsed ids (string → array)', async () => {
    const svc = makeSvc();
    const ctrl = new AnalyticsExecutiveController(svc as never, makeScope() as never);

    await ctrl.getExecutiveDashboard({ tenantId: 't1' }, 'p1', '2026-01-01,2026-06-30');
    expect(svc.getExecutiveDashboard).toHaveBeenCalledWith(
      't1',
      ['p1'],
      '2026-01-01,2026-06-30',
      10,
    );
  });

  it('delegates with array projectIds unchanged', async () => {
    const svc = makeSvc();
    const ctrl = new AnalyticsExecutiveController(svc as never, makeScope() as never);

    await ctrl.getExecutiveDashboard({ tenantId: 't1' }, ['p1', 'p2'], '2026-01-01,2026-06-30');
    expect(svc.getExecutiveDashboard).toHaveBeenCalledWith(
      't1',
      ['p1', 'p2'],
      '2026-01-01,2026-06-30',
      10,
    );
  });

  it('defaults to an empty projectIds array when the query param is omitted', async () => {
    const svc = makeSvc();
    const ctrl = new AnalyticsExecutiveController(svc as never, makeScope() as never);

    await ctrl.getExecutiveDashboard(
      { tenantId: 't1' },
      undefined as unknown as string,
      '2026-01-01,2026-06-30',
    );
    expect(svc.getExecutiveDashboard).toHaveBeenCalledWith('t1', [], '2026-01-01,2026-06-30', 10);
  });

  it('parses riskThresholdPct string to number', async () => {
    const svc = makeSvc();
    const ctrl = new AnalyticsExecutiveController(svc as never, makeScope() as never);

    await ctrl.getExecutiveDashboard({ tenantId: 't1' }, 'p1', '2026-01-01,2026-06-30', '15');
    expect(svc.getExecutiveDashboard).toHaveBeenCalledWith(
      't1',
      ['p1'],
      '2026-01-01,2026-06-30',
      15,
    );
  });

  // §6.5 — a project-scoped role asking for a project it is not assigned to must not reach the
  // dashboard query with that id, no matter what the query string said.
  it('queries only the projects the scope service cleared', async () => {
    const svc = makeSvc();
    const scope = makeScope(['p1']); // caller is a member of p1 only
    const ctrl = new AnalyticsExecutiveController(svc as never, scope as never);

    await ctrl.getExecutiveDashboard({ tenantId: 't1' }, ['p1', 'p2'], '2026-01-01,2026-06-30');

    expect(scope.filterVisibleProjectIds).toHaveBeenCalledWith(['p1', 'p2']);
    expect(svc.getExecutiveDashboard).toHaveBeenCalledWith(
      't1',
      ['p1'],
      '2026-01-01,2026-06-30',
      10,
    );
  });
});

describe('AnalyticsPmController', () => {
  it('delegates to svc.getPmDashboard with correct args', () => {
    const svc = makeSvc();
    const ctrl = new AnalyticsPmController(svc as never);

    ctrl.getPmDashboard({ tenantId: 't1' }, 'proj-1', '2026-01-01,2026-03-31');
    expect(svc.getPmDashboard).toHaveBeenCalledWith('t1', 'proj-1', '2026-01-01,2026-03-31');
  });
});

describe('AnalyticsTrendsController', () => {
  it('getCostTrend delegates to svc', () => {
    const svc = makeSvc();
    const ctrl = new AnalyticsTrendsController(svc as never);

    ctrl.getCostTrend({ tenantId: 't1' }, 'proj-1', '2026-01-01,2026-03-31');
    expect(svc.getCostTrend).toHaveBeenCalledWith('t1', 'proj-1', '2026-01-01,2026-03-31');
  });

  it('getProcurementTrend delegates to svc', () => {
    const svc = makeSvc();
    const ctrl = new AnalyticsTrendsController(svc as never);

    ctrl.getProcurementTrend({ tenantId: 't1' }, 'proj-1', '2026-01-01,2026-03-31');
    expect(svc.getProcurementTrend).toHaveBeenCalledWith('t1', 'proj-1', '2026-01-01,2026-03-31');
  });

  it('getSiteTrend delegates to svc', () => {
    const svc = makeSvc();
    const ctrl = new AnalyticsTrendsController(svc as never);

    ctrl.getSiteTrend({ tenantId: 't1' }, 'proj-1', '2026-01-01,2026-03-31');
    expect(svc.getSiteTrend).toHaveBeenCalledWith('t1', 'proj-1', '2026-01-01,2026-03-31');
  });
});
