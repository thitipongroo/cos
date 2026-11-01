// Plan limits and trial terms — the one table both enforcement points read (spec §26.1, §26.1.2, §7.10; ADR-109).
//
// PUBLIC API of the tenant module: the project module reads PLAN_PROJECT_LIMIT when a project is created
// (COS-PLAN-001), the tenant module when a trial converts (COS-PLAN-002).

import type { PlanType, Prisma } from '@prisma/client';
import { TRIAL_READ_ONLY_CODE } from '../../../shared/interceptors/trial-read-only.interceptor';

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
  READ_ONLY: TRIAL_READ_ONLY_CODE,
  NOT_CONVERTIBLE: 'COS-PLAN-004',
} as const;

/**
 * The tenant's plan, read inside the caller's transaction AFTER taking a per-tenant transaction lock, so two
 * concurrent project creations cannot both see room under the limit and both commit (§26.1, COS-PLAN-001).
 *
 * An advisory lock rather than SELECT … FOR UPDATE: the caller is the app_user connection, which may read its own
 * tenant row (rls_tenants_read) but holds no UPDATE right on platform.tenants. The lock is released at commit or
 * rollback. Returns null when the row is not visible — the caller decides what that means.
 */
export async function lockTenantPlan(
  tx: Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw'>,
  tenantId: string,
): Promise<PlanType | null> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`cos:plan-limit:${tenantId}`}, 0))`;
  const [row] = await tx.$queryRaw<Array<{ plan_type: PlanType }>>`
    SELECT plan_type FROM platform.tenants WHERE tenant_id = ${tenantId}::uuid
  `;
  return row?.plan_type ?? null;
}
