// Plan limits and trial terms — the one table both enforcement points read (spec §26.1, §26.1.2, §7.10; ADR-109).
//
// PUBLIC API of the tenant module: the project module reads PLAN_PROJECT_LIMIT when a project is created
// (COS-PLAN-001), the tenant module when a trial converts (COS-PLAN-002).

import type { PlanType } from '@prisma/client';

/** Active projects (DRAFT/ACTIVE/ON_HOLD) a plan allows. null = no limit (ENTERPRISE, quoted per contract). */
export const PLAN_PROJECT_LIMIT: Readonly<Record<PlanType, number | null>> = {
  LITE: 1,
  STARTER: 3,
  PROFESSIONAL: 10,
  ENTERPRISE: null,
};

/** Length of a free trial (§26.1.2). trial_ends_at = trial_started_at + this. */
export const TRIAL_DAYS = 30;

/**
 * Plans a trial can run on and a trial can convert to. ENTERPRISE is neither: it has its own realm, database and
 * contract, and reaches ACTIVE through the provisioning workflow (§34), not through a trial.
 */
export const TRIAL_PLANS = [
  'LITE',
  'STARTER',
  'PROFESSIONAL',
] as const satisfies readonly PlanType[];
export type TrialPlan = (typeof TRIAL_PLANS)[number];

/** platform.tenants.subscription_status (CHECK tenants_subscription_status_valid). */
export const SUBSCRIPTION_STATUSES = ['ACTIVE', 'TRIAL', 'EXPIRED', 'PENDING_DELETION'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Error codes of docs/api/error-codes.md § COS-PLAN. */
export const PLAN_ERROR = {
  PROJECT_LIMIT_REACHED: 'COS-PLAN-001',
  PLAN_BELOW_USAGE: 'COS-PLAN-002',
  READ_ONLY: 'COS-PLAN-003',
  NOT_CONVERTIBLE: 'COS-PLAN-004',
} as const;
