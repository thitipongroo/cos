// The landing route must always be a tab the role can actually see.
//
// The bug this locks down shipped the moment SITE_WORKER lost its Home tab: app/index.tsx redirected
// every role to /(app)/home, so that role landed on a screen absent from its own bottom bar — nothing
// highlighted, and no way back to it once another tab was tapped.

import { CosRole } from '@cos/types';
import { ALL_TABS } from '../roleTabs';
import { landingRouteFor } from '../landingRoute';

describe('landingRouteFor', () => {
  it.each(Object.values(CosRole))('sends %s to a tab that role can see', (role) => {
    const href = landingRouteFor(role);
    const routeName = href.replace('/(app)/', '');
    const tab = ALL_TABS.find((candidate) => candidate.name === routeName);

    // SYSTEM_ADMIN has Home and nothing else by design (§20.7.11 puts its work in the web /admin
    // panel), so every role resolves to a real tab — there is no "no tabs at all" case today, and if
    // one is introduced this assertion is where it surfaces.
    expect(tab).toBeDefined();
    expect(tab?.roles).toContain(role);
  });

  it('sends SITE_WORKER to Tasks, not the Home it no longer has as a tab', () => {
    expect(landingRouteFor(CosRole.SITE_WORKER)).toBe('/(app)/tasks');
  });

  it('sends every other role to Home, which is still their first tab', () => {
    expect(landingRouteFor(CosRole.SITE_ENGINEER)).toBe('/(app)/home');
    expect(landingRouteFor(CosRole.TENANT_ADMIN)).toBe('/(app)/home');
  });

  it('falls back to Home when the role is not hydrated yet', () => {
    expect(landingRouteFor(null)).toBe('/(app)/home');
    expect(landingRouteFor(undefined)).toBe('/(app)/home');
  });

  it('falls back to Home for a role that matches no tab at all', () => {
    // Unreachable through CosRole today — every real role matches at least Home — but the guard is
    // the difference between a safe landing and `/(app)/undefined` if a role is ever added to the
    // enum before its tabs. Cast because the input is deliberately not a member of the union.
    expect(landingRouteFor('NOT_A_REAL_ROLE' as CosRole)).toBe('/(app)/home');
  });
});
