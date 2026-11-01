// The plan table is the published price list's promise (§26.1), so it is pinned.

import { PlanType } from '@prisma/client';
import {
  PLAN_PROJECT_LIMIT,
  SUBSCRIPTION_STATUSES,
  TRIAL_DAYS,
  TRIAL_PLANS,
} from '../public/plan-limits';

describe('plan limits (§26.1, ADR-109)', () => {
  it('limits active projects per plan as published; ENTERPRISE has none', () => {
    expect(PLAN_PROJECT_LIMIT).toEqual({ LITE: 1, STARTER: 3, PROFESSIONAL: 10, ENTERPRISE: null });
  });

  it('has a row for every platform."PlanType" value', () => {
    expect(Object.keys(PLAN_PROJECT_LIMIT).sort()).toEqual(Object.values(PlanType).sort());
  });

  it('runs a trial for 30 days, on every plan but ENTERPRISE', () => {
    expect(TRIAL_DAYS).toBe(30);
    expect(TRIAL_PLANS).toEqual(['LITE', 'STARTER', 'PROFESSIONAL']);
  });

  it('matches the subscription_status CHECK constraint', () => {
    expect(SUBSCRIPTION_STATUSES).toEqual(['ACTIVE', 'TRIAL', 'EXPIRED', 'PENDING_DELETION']);
  });
});
