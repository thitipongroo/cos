import {
  AUDIT_ACTION_FILTERS,
  auditActionFor,
  auditQuery,
  auditTone,
  exclusiveTo,
  justificationShare,
  utcDay,
} from '../adminAudit';

describe('auditQuery', () => {
  it('drops unset keys and orders the rest', () => {
    expect(auditQuery({ q: 'deact', cursor: null, limit: 50, from: '', tenantId: undefined })).toBe(
      '?limit=50&q=deact',
    );
  });
  it('encodes values', () => {
    expect(auditQuery({ action: 'tenant.', q: 'a&b' })).toBe('?action=tenant.&q=a%26b');
  });
  it('is empty when nothing is set', () => {
    expect(auditQuery({ q: '' })).toBe('');
  });
});

describe('auditTone', () => {
  it.each([
    ['tenant.deactivate', 'danger'],
    ['tenant.provisioning.approve', 'gate'],
    ['tenant.create', 'privileged'],
    ['platform.settings.update', 'config'],
    ['central_prices.import', 'config'],
    ['audit.read', 'read'],
    ['user.login', 'other'],
  ])('%s → %s', (action, tone) => {
    expect(auditTone(action)).toBe(tone);
  });
});

describe('utcDay / exclusiveTo', () => {
  it('reads the UTC day', () => {
    expect(utcDay(new Date('2026-09-15T23:30:00-07:00'))).toBe('2026-09-16');
  });
  it('moves an inclusive end day to the next day, across a month end', () => {
    expect(exclusiveTo('2026-09-30')).toBe('2026-10-01');
  });
});

describe('auditActionFor', () => {
  it.each([
    ['all', undefined],
    ['deactivate', 'tenant.deactivate'],
    ['provision', 'tenant.assign_dedicated_db'],
    ['tier', 'tenant.mark_contracted'],
    ['gateway', undefined],
    ['gate', 'tenant.provisioning.'],
  ] as const)('%s → %s', (key, action) => {
    expect(auditActionFor(key)).toBe(action);
  });
  it('lists the six drawn categories in order', () => {
    expect(AUDIT_ACTION_FILTERS.map((f) => f.key)).toEqual([
      'all',
      'deactivate',
      'provision',
      'tier',
      'gateway',
      'gate',
    ]);
  });
});

describe('justificationShare', () => {
  it('is null with no privileged actions', () => {
    expect(justificationShare(0, 0)).toEqual({ percent: null, missing: 0 });
  });
  it('is 100 when every action has one', () => {
    expect(justificationShare(6, 6)).toEqual({ percent: 100, missing: 0 });
  });
  it('rounds down and counts the missing', () => {
    expect(justificationShare(6, 7)).toEqual({ percent: 85, missing: 1 });
    expect(justificationShare(996, 1000)).toEqual({ percent: 99, missing: 4 });
  });
  it('never exceeds 100 or goes negative', () => {
    expect(justificationShare(8, 7)).toEqual({ percent: 100, missing: 0 });
  });
});
