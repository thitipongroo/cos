import { actionForCommand } from '../voiceCommand';

describe('actionForCommand — voice intent → mobile action (ADR-073)', () => {
  it('DAILY_REPORT routes to /report, prefilling the transcript', () => {
    expect(actionForCommand({ intent: 'DAILY_REPORT', text: 'poured zone A' })).toEqual({
      kind: 'route',
      route: '/report',
      params: { note: 'poured zone A' },
    });
  });

  it('DAILY_REPORT with no text routes without params', () => {
    expect(actionForCommand({ intent: 'DAILY_REPORT' })).toEqual({
      kind: 'route',
      route: '/report',
    });
  });

  it('LOG_ISSUE routes to /issues with the dictated note', () => {
    expect(actionForCommand({ intent: 'LOG_ISSUE', text: 'crack in beam' })).toEqual({
      kind: 'route',
      route: '/issues',
      params: { note: 'crack in beam' },
    });
  });

  it('NAVIGATE routes to a known screen', () => {
    expect(actionForCommand({ intent: 'NAVIGATE', target: 'inspections' })).toEqual({
      kind: 'route',
      route: '/inspections',
    });
  });

  it('NAVIGATE to an unknown target is unsupported', () => {
    expect(actionForCommand({ intent: 'NAVIGATE', target: 'payroll' })).toEqual({
      kind: 'unsupported',
      reason: 'destination',
    });
  });

  it('NAVIGATE with no target is unsupported', () => {
    expect(actionForCommand({ intent: 'NAVIGATE' })).toEqual({
      kind: 'unsupported',
      reason: 'destination',
    });
  });

  it('SEARCH is recognised but unsupported (no search screen yet)', () => {
    expect(actionForCommand({ intent: 'SEARCH', text: 'steel delivery' })).toEqual({
      kind: 'unsupported',
      reason: 'search',
    });
  });

  it('UNKNOWN maps to unsupported (never fires a wrong action)', () => {
    expect(actionForCommand({ intent: 'UNKNOWN' })).toEqual({
      kind: 'unsupported',
      reason: 'unrecognized',
    });
  });
});
