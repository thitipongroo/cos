/**
 * The SYSTEM_ADMIN side of the free trial (§7.10, ADR-109): how a tenant's subscription state reads in the Tenant
 * List and Tenant Detail, who may be converted, and what a refused conversion says. Pure, so it sits inside the
 * QM-1 gate; the modals only render it.
 */

import type { SubscriptionStatus } from '@cos/ui-logic';
import { errorKeyForStatus, type PlanType, type TenantListRow } from './adminTenants';

/** Plans a trial runs on and converts to — CreateTrialTenantDto / ConvertTenantDto. ENTERPRISE is contracted (§34). */
export const TRIAL_PLANS = ['LITE', 'STARTER', 'PROFESSIONAL'] as const;
export type TrialPlan = (typeof TRIAL_PLANS)[number];

/** Active projects each plan allows (§26.1) — printed on the plan choices so the operator sees the limit. */
export const PLAN_PROJECT_LIMIT: Readonly<Record<TrialPlan, number>> = {
  LITE: 1,
  STARTER: 3,
  PROFESSIONAL: 10,
};

export type SubscriptionTone = 'trial' | 'readOnly' | 'deletion';

export interface SubscriptionView {
  /** i18n key — never copy (QM-3). */
  labelKey: string;
  tone: SubscriptionTone;
}

/** The badge beside the plan. A paying tenant (ACTIVE) gets none; a status this build does not know, neither. */
export function subscriptionView(status: SubscriptionStatus | string): SubscriptionView | null {
  switch (status) {
    case 'TRIAL':
      return { labelKey: 'admin.subscription.TRIAL', tone: 'trial' };
    case 'EXPIRED':
      return { labelKey: 'admin.subscription.EXPIRED', tone: 'readOnly' };
    case 'PENDING_DELETION':
      return { labelKey: 'admin.subscription.PENDING_DELETION', tone: 'deletion' };
    default:
      return null;
  }
}

/**
 * The date printed after the badge: the trial's end, while it runs ("ends …") and once it has ended ("ended … —
 * read-only"). None for a tenant due for deletion — its trial end would read as the deletion date, which it is not.
 */
export function subscriptionDate(
  row: Pick<TenantListRow, 'subscription_status' | 'trial_ends_at'>,
): string | null {
  return row.subscription_status === 'TRIAL' || row.subscription_status === 'EXPIRED'
    ? row.trial_ends_at
    : null;
}

/** Convert is offered for an active tenant that is or was a trial and has not been converted. */
export function canConvert(row: Pick<TenantListRow, 'is_active' | 'subscription_status'>): boolean {
  return row.is_active && row.subscription_status !== 'ACTIVE';
}

/** The plan Convert starts on: the one trialled, when it is a trial plan; otherwise Starter. */
export function defaultConvertPlan(plan: PlanType): TrialPlan {
  return (TRIAL_PLANS as readonly string[]).includes(plan) ? (plan as TrialPlan) : 'STARTER';
}

/**
 * What a refused conversion says. The two 409s mean different things to the operator — the customer must close
 * projects (COS-PLAN-002), or someone already converted it (COS-PLAN-004) — so they are told apart by code.
 */
export function convertErrorKey(
  error: { status?: number; code?: string } | null | undefined,
): string {
  if (error?.code === 'COS-PLAN-002') return 'admin.tenant.error.planBelowUsage';
  if (error?.code === 'COS-PLAN-004') return 'admin.tenant.error.notConvertible';
  return errorKeyForStatus(error?.status, 'rowAction');
}

/** What a refused trial creation says: a taken code, or the general admin message for its status. */
export function createTrialErrorKey(status: number | undefined): string {
  return errorKeyForStatus(status, 'create');
}
