/**
 * Post-login landing routes per role — the first-row page of each role's
 * inventory in spec §20.7. Used by the post-login redirect and the `/` router.
 *
 * SITE_WORKER (`/tasks`, Increment 9) and SAFETY_OFFICER (`/safety/incidents`,
 * Increment 10) now route to their §20.7 landings — their backends have shipped.
 */
import { CosRole } from '@cos/types';

export const ROLE_LANDING: Record<string, string> = {
  [CosRole.EXECUTIVE]: '/',
  [CosRole.PROJECT_MANAGER]: '/projects',
  [CosRole.PROCUREMENT_OFFICER]: '/procurement/requests',
  [CosRole.PROC_MANAGER]: '/procurement/requests',
  [CosRole.FINANCE]: '/finance/payments',
  [CosRole.SITE_ENGINEER]: '/site/reports',
  [CosRole.SITE_WORKER]: '/tasks',
  [CosRole.SAFETY_OFFICER]: '/safety/incidents',
  [CosRole.TENANT_ADMIN]: '/settings/users',
  [CosRole.VIEWER]: '/',
};

/** Resolve the landing route for a role claim; unknown/missing → `/pending`. */
export function landingFor(role: string | undefined | null): string {
  if (role && role in ROLE_LANDING) {
    return ROLE_LANDING[role];
  }
  return '/pending';
}
