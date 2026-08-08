// Where a signed-in user lands.
//
// This used to be the literal `/(app)/home` in app/index.tsx, which was correct only while EVERY role
// had a Home tab. SITE_WORKER no longer does (PO decision 2026-08-08 — its four mockups draw
// Tasks | Issues | Reports | Safety and no landing page), and a hardcoded /home dropped that role on
// a screen its own bottom bar cannot reach: no tab highlighted, and the only way back into the app
// was to tap a tab and never return.
//
// Deriving the landing from the role's OWN tab set means the two can never disagree again — change a
// role's tabs and its landing follows automatically.

import { CosRole } from '@cos/types';
import { ALL_TABS } from './roleTabs';

/** Fallback when the role is unknown (not yet hydrated, or a role with no tabs at all). */
const DEFAULT_LANDING = '/(app)/home';

/**
 * The first tab the given role can see, as an expo-router href.
 *
 * `ALL_TABS` is ordered, and MobileNav renders in that order, so "first visible tab" is exactly the
 * leftmost item on the user's bottom bar — the one they would otherwise have to tap to get started.
 */
export function landingRouteFor(role: CosRole | null | undefined): string {
  if (!role) return DEFAULT_LANDING;
  const first = ALL_TABS.find((tab) => tab.roles.includes(role));
  return first ? `/(app)/${first.name}` : DEFAULT_LANDING;
}
