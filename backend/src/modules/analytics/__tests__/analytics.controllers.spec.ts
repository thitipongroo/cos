// Analytics Controllers — unit tests
// Tests that each controller delegates correctly to AnalyticsService.

import { AnalyticsExecutiveController } from '../analytics.executive.controller';
import { AnalyticsPmController } from '../analytics.pm.controller';
import { AnalyticsTrendsController } from '../analytics.trends.controller';

const makeSvc = () => ({
  getExecutiveDashboard: jest.fn().mockResolvedValue([]),
  getPmDashboard: jest.fn().mockResolvedValue([]),
  getCostTrend: jest.fn().mockResolvedValue([]),
  getProcurementTrend: jest.fn().mockResolvedValue([]),
  getSiteTrend: jest.fn().mockResolvedValue([]),
  invalidate: jest.fn().mockResolvedValue(undefined),
});

describe('AnalyticsExecutiveController', () => {
  it('delegates to svc.getExecutiveDashboard with parsed ids (string → array)', () => {
    const svc = makeSvc();
    const ctrl = new AnalyticsExecutiveController(svc as never);

    ctrl.getExecutiveDashboard('t1', 'p1', '2026-01-01,2026-06-30');
    expect(svc.getExecutiveDashboard).toHaveBeenCalledWith(
      't1',
      ['p1'],
      '2026-01-01,2026-06-30',
      10,
    );
  });

  it('delegates with array projectIds unchanged', () => {
    const svc = makeSvc();
    const ctrl = new AnalyticsExecutiveController(svc as never);

    ctrl.getExecutiveDashboard('t1', ['p1', 'p2'], '2026-01-01,2026-06-30');
    expect(svc.getExecutiveDashboard).toHaveBeenCalledWith(
      't1',
      ['p1', 'p2'],
      '2026-01-01,2026-06-30',
      10,
    );
  });

  it('parses riskThresholdPct string to number', () => {
    const svc = makeSvc();
    const ctrl = new AnalyticsExecutiveController(svc as never);

    ctrl.getExecutiveDashboard('t1', 'p1', '2026-01-01,2026-06-30', '15');
    expect(svc.getExecutiveDashboard).toHaveBeenCalledWith(
      't1',
      ['p1'],
      '2026-01-01,2026-06-30',
      15,
    );
  });
});

describe('AnalyticsPmController', () => {
  it('delegates to svc.getPmDashboard with correct args', () => {
    const svc = makeSvc();
    const ctrl = new AnalyticsPmController(svc as never);

    ctrl.getPmDashboard('proj-1', 't1', '2026-01-01,2026-03-31');
    expect(svc.getPmDashboard).toHaveBeenCalledWith('t1', 'proj-1', '2026-01-01,2026-03-31');
  });
});

describe('AnalyticsTrendsController', () => {
  it('getCostTrend delegates to svc', () => {
    const svc = makeSvc();
    const ctrl = new AnalyticsTrendsController(svc as never);

    ctrl.getCostTrend('proj-1', 't1', '2026-01-01,2026-03-31');
    expect(svc.getCostTrend).toHaveBeenCalledWith('t1', 'proj-1', '2026-01-01,2026-03-31');
  });

  it('getProcurementTrend delegates to svc', () => {
    const svc = makeSvc();
    const ctrl = new AnalyticsTrendsController(svc as never);

    ctrl.getProcurementTrend('proj-1', 't1', '2026-01-01,2026-03-31');
    expect(svc.getProcurementTrend).toHaveBeenCalledWith('t1', 'proj-1', '2026-01-01,2026-03-31');
  });

  it('getSiteTrend delegates to svc', () => {
    const svc = makeSvc();
    const ctrl = new AnalyticsTrendsController(svc as never);

    ctrl.getSiteTrend('proj-1', 't1', '2026-01-01,2026-03-31');
    expect(svc.getSiteTrend).toHaveBeenCalledWith('t1', 'proj-1', '2026-01-01,2026-03-31');
  });
});
