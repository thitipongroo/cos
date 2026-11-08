import {
  canConvert,
  convertErrorKey,
  createTrialErrorKey,
  defaultConvertPlan,
  PLAN_PROJECT_LIMIT,
  subscriptionDate,
  subscriptionView,
  TRIAL_PLANS,
} from '../adminTrial';
import { errorKeyForStatus } from '../adminTenants';

describe('subscriptionView (§7.10)', () => {
  it.each([
    ['TRIAL', 'admin.subscription.TRIAL', 'trial'],
    ['EXPIRED', 'admin.subscription.EXPIRED', 'readOnly'],
    ['PENDING_DELETION', 'admin.subscription.PENDING_DELETION', 'deletion'],
  ])('%s → %s', (status, labelKey, tone) => {
    expect(subscriptionView(status)).toEqual({ labelKey, tone });
  });

  it('shows no badge for a paying tenant or an unknown status', () => {
    expect(subscriptionView('ACTIVE')).toBeNull();
    expect(subscriptionView('SUSPENDED')).toBeNull();
  });
});

describe('canConvert', () => {
  it.each([
    [true, 'TRIAL', true],
    [true, 'EXPIRED', true],
    [true, 'PENDING_DELETION', true],
    [true, 'ACTIVE', false],
    [false, 'TRIAL', false],
  ] as const)('is_active %s, %s → %s', (is_active, subscription_status, expected) => {
    expect(canConvert({ is_active, subscription_status })).toBe(expected);
  });
});

describe('defaultConvertPlan', () => {
  it('starts on the plan trialled, or Starter for anything else', () => {
    expect(defaultConvertPlan('LITE')).toBe('LITE');
    expect(defaultConvertPlan('PROFESSIONAL')).toBe('PROFESSIONAL');
    expect(defaultConvertPlan('ENTERPRISE')).toBe('STARTER');
  });
});

describe('convertErrorKey', () => {
  // The API's own messageKeys for COS-PLAN-002 / -004 (docs/api/error-codes.md).
  it('tells the two 409s apart by code', () => {
    expect(convertErrorKey({ status: 409, code: 'COS-PLAN-002' })).toBe(
      'admin.tenant.error.planBelowUsage',
    );
    expect(convertErrorKey({ status: 409, code: 'COS-PLAN-004' })).toBe(
      'admin.tenant.error.notConvertible',
    );
  });

  it('falls back to the row-action message for its status', () => {
    expect(convertErrorKey({ status: 403 })).toBe(errorKeyForStatus(403, 'rowAction'));
    expect(convertErrorKey(null)).toBe(errorKeyForStatus(undefined, 'rowAction'));
  });
});

describe('createTrialErrorKey', () => {
  it('uses the create messages', () => {
    expect(createTrialErrorKey(409)).toBe(errorKeyForStatus(409, 'create'));
  });
});

describe('plan constants', () => {
  it('match CreateTrialTenantDto and §26.1', () => {
    expect(TRIAL_PLANS).toEqual(['LITE', 'STARTER', 'PROFESSIONAL']);
    expect(PLAN_PROJECT_LIMIT).toEqual({ LITE: 1, STARTER: 3, PROFESSIONAL: 10 });
  });
});

describe('subscriptionDate', () => {
  it('prints the trial end while running and once ended, never for a tenant due for deletion', () => {
    const at = '2026-12-01T00:00:00Z';
    expect(subscriptionDate({ subscription_status: 'TRIAL', trial_ends_at: at })).toBe(at);
    expect(subscriptionDate({ subscription_status: 'EXPIRED', trial_ends_at: at })).toBe(at);
    expect(
      subscriptionDate({ subscription_status: 'PENDING_DELETION', trial_ends_at: at }),
    ).toBeNull();
    expect(subscriptionDate({ subscription_status: 'ACTIVE', trial_ends_at: at })).toBeNull();
  });
});
