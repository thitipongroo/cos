// Free-trial banner state (spec §7.10, ADR-109) — the platform-agnostic half of the web and mobile trial banners.
//
// Both shells read GET /tenant (subscription_status, trial_ends_at, read_only_until) and render what this returns:
// nothing for a paying tenant, a countdown while the trial runs, and a read-only notice once it has ended — so a
// user learns why a save is refused (403 COS-PLAN-003) before they try one. Copy, colours and layout stay in each
// app; this decides only WHICH banner and the numbers in it.

/** platform.tenants.subscription_status. */
export type SubscriptionStatus = 'ACTIVE' | 'TRIAL' | 'EXPIRED' | 'PENDING_DELETION';

/** The fields of GET /tenant this reads. Dates are ISO 8601 strings, as the API sends them. */
export interface TenantSubscription {
  subscription_status: string;
  trial_ends_at: string | null;
  read_only_until: string | null;
}

export type TrialBanner =
  /** The trial is running. `urgent` from 7 days left, when the copy should push towards choosing a plan. */
  | { kind: 'trial'; daysLeft: number; endsAt: string; urgent: boolean }
  /** The trial ended: read and export only, until `until`. */
  | { kind: 'readOnly'; until: string | null }
  /** The read-only month is over and the data is about to be deleted (§7.10 Deletion). */
  | { kind: 'deletionPending' };

const DAY_MS = 86_400_000;

/** Days left from 7 on: the last week, when the website's own reminders (day 21, 28) start too. */
export const TRIAL_URGENT_DAYS = 7;

/** The 403 the API answers a write with while the trial is read-only. */
export const TRIAL_READ_ONLY_CODE = 'COS-PLAN-003';

/** Which banner, if any, a tenant in this state should see at `now`. */
export function trialBanner(
  tenant: TenantSubscription | null | undefined,
  now: Date,
): TrialBanner | null {
  if (!tenant) return null;
  switch (tenant.subscription_status) {
    case 'TRIAL': {
      // A TRIAL row always has its end date (CHECK tenants_trial_dates_consistent); without one there is
      // nothing true to count down to, so say nothing rather than invent a number.
      if (!tenant.trial_ends_at) return null;
      const ms = new Date(tenant.trial_ends_at).getTime() - now.getTime();
      // Ceil: with 2.5 days left the trial still has part of a third day; 0 means "ends today".
      const daysLeft = Math.max(0, Math.ceil(ms / DAY_MS));
      return {
        kind: 'trial',
        daysLeft,
        endsAt: tenant.trial_ends_at,
        urgent: daysLeft <= TRIAL_URGENT_DAYS,
      };
    }
    case 'EXPIRED':
      return { kind: 'readOnly', until: tenant.read_only_until };
    case 'PENDING_DELETION':
      return { kind: 'deletionPending' };
    default:
      // ACTIVE, and any status a newer server sends that this build does not know: no banner.
      return null;
  }
}

/**
 * Where a trial customer chooses a plan. There is no in-app checkout (plans are sold by the team, ADR-109 decision
 * 5), so the banner links to the published price list and to the sales mailbox. Values are the website's own
 * (construction-os.io `src/config/company.ts` and its `#pricing` section, read 2026-11-01) — change them there and
 * here together.
 */
export const TRIAL_CONTACT = {
  pricingUrl: 'https://construction-os.io/#pricing',
  email: 'info@construction-os.io',
} as const;

/**
 * A `mailto:` to the sales mailbox naming the tenant, so the team can find the trial without asking. The tenant code
 * is the platform's identifier, not personal data.
 */
export function trialContactMailto(tenantCode: string, subject: string): string {
  const params = new URLSearchParams({ subject: `${subject} — ${tenantCode}` });
  // URLSearchParams encodes spaces as "+", which mail clients show literally; mailto wants %20.
  return `mailto:${TRIAL_CONTACT.email}?${params.toString().replace(/\+/g, '%20')}`;
}
