/**
 * Post-login landing routes per role — the first-row page of each role's
 * inventory in spec §20.7. Used by the post-login redirect and the `/` router.
 *
 * DECISION-2 note: SITE_WORKER's spec landing (`/tasks`) and SAFETY_OFFICER's
 * spec landing (`/safety/incidents`) depend on backend (Task entity / safety
 * incidents) that does not exist yet and is tracked as a separate workstream.
 * Until that backend lands, SITE_WORKER routes to its first READY page
 * (`/site/reports/new`) and SAFETY_OFFICER routes to the honest `/pending`
 * notice. These two entries change to their §20.7 values once the backend ships.
 */
import { CosRole } from '@cos/types';

export const ROLE_LANDING: Record<string, string> = {
  [CosRole.EXECUTIVE]: '/',
  [CosRole.PROJECT_MANAGER]: '/projects',
  [CosRole.PROCUREMENT_OFFICER]: '/procurement/requests',
  [CosRole.PROC_MANAGER]: '/procurement/requests',
  [CosRole.FINANCE]: '/finance/payments',
  [CosRole.SITE_ENGINEER]: '/site/reports',
  [CosRole.TENANT_ADMIN]: '/settings/users',
  [CosRole.VIEWER]: '/',
  // Deferred landings (DECISION-2) — see file header.
  [CosRole.SITE_WORKER]: '/site/reports/new',
  [CosRole.SAFETY_OFFICER]: '/pending',
};

/** Resolve the landing route for a role claim; unknown/missing → `/pending`. */
export function landingFor(role: string | undefined | null): string {
  if (role && role in ROLE_LANDING) {
    return ROLE_LANDING[role];
  }
  return '/pending';
}
