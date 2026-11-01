// The plan table is the published price list's promise (§26.1), so it is pinned.

import { PlanType } from '@prisma/client';
import {
  lockTenantPlan,
  PLAN_ERROR,
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

describe('lockTenantPlan', () => {
  const TENANT = '11111111-1111-4111-8111-111111111111';

  it('takes the per-tenant transaction lock, then reads the plan', async () => {
    const order: string[] = [];
    const tx = {
      $executeRaw: jest.fn(async () => (order.push('lock'), 1)),
      $queryRaw: jest.fn(async () => (order.push('read'), [{ plan_type: 'STARTER' }])),
    };
    await expect(lockTenantPlan(tx as never, TENANT)).resolves.toBe('STARTER');
    expect(order).toEqual(['lock', 'read']);
    const [strings, key] = tx.$executeRaw.mock.calls[0] as unknown as [
      TemplateStringsArray,
      string,
    ];
    expect(strings.join('?')).toContain('pg_advisory_xact_lock(hashtextextended(?, 0))');
    expect(key).toBe(`cos:plan-limit:${TENANT}`);
  });

  it('returns null when the tenant row is not visible', async () => {
    const tx = { $executeRaw: jest.fn(), $queryRaw: jest.fn().mockResolvedValue([]) };
    await expect(lockTenantPlan(tx as never, TENANT)).resolves.toBeNull();
  });

  it('uses the read-only code the interceptor raises', () => {
    expect(PLAN_ERROR.READ_ONLY).toBe('COS-PLAN-003');
  });
});
