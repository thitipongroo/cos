// The signed-in user's own tenant identity — GET /tenant (name + code + plan, and since ADR-109 the free-trial
// state). Powers the Tenant Admin settings screen's Organization Info and the shell's <TrialBanner />.
// Self-service (scoped by the JWT tenant_id, any authenticated role).

import { get } from './client';

export interface MyTenant {
  tenant_name: string;
  tenant_code: string;
  plan_type: string;
  /** §7.10: ACTIVE | TRIAL | EXPIRED | PENDING_DELETION. */
  subscription_status: string;
  /** ISO 8601; null for a tenant that was never a trial. */
  trial_ends_at: string | null;
  /** ISO 8601 — trial_ends_at + 30 days, when a read-only trial becomes due for deletion. */
  read_only_until: string | null;
}

export async function getMyTenant(): Promise<MyTenant> {
  return get<MyTenant>('/tenant');
}
