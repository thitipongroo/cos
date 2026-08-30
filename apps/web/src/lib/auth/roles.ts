/**
 * Post-login landing routes per role — the first-row page of each role's
 * inventory in spec §20.7. Used by the post-login redirect and the `/` router.
 *
 * SITE_WORKER (`/tasks`, Increment 9) and SAFETY_OFFICER (`/safety/incidents`,
 * Increment 10) now route to their §20.7 landings — their backends have shipped.
 */
import { CosRole } from '@cos/types';

export const ROLE_LANDING: Record<string, string> = {
  [CosRole.SYSTEM_ADMIN]: '/admin',
  [CosRole.EXECUTIVE]: '/',
  [CosRole.PROJECT_MANAGER]: '/projects',
  [CosRole.PROCUREMENT_OFFICER]: '/procurement/requests',
  [CosRole.PROC_MANAGER]: '/procurement/requests',
  [CosRole.FINANCE]: '/finance/payments',
  [CosRole.SITE_ENGINEER]: '/site/reports',
  [CosRole.CRM_SALES_MANAGER]: '/crm/leads',
  [CosRole.SITE_WORKER]: '/tasks',
  [CosRole.SAFETY_OFFICER]: '/safety/incidents',
  [CosRole.TENANT_ADMIN]: '/settings/users',
  [CosRole.VIEWER]: '/',
};

/** Resolve the landing route for a role claim; unknown/missing → `/pending`. */
export function landingFor(role: string | undefined | null): string {
  // Object.hasOwn, not the `in` operator — `in` walks the prototype chain, so a role claim of 'toString' or
  // 'constructor' resolved to an inherited Object member and this returned a Function instead of a
  // route (§35.13 ESC-26). The role comes from a JWT claim, so it is untrusted input.
  if (role && Object.hasOwn(ROLE_LANDING, role)) {
    return ROLE_LANDING[role];
  }
  return '/pending';
}
