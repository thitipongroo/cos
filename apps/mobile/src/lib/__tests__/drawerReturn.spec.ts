// Which routes return to the navigation drawer on Back (product-owner decision 2026-09-13).
//
// The list is small and the predicate is three tokens long, so what these cases are really holding
// is the SHAPE of the rule rather than its arithmetic: exact paths, no prefix matching, and a
// definition that both Back gestures read from one place instead of restating it.

import { DRAWER_RETURN_ROUTES, returnsToDrawer } from '../drawerReturn';

describe('returnsToDrawer', () => {
  it('is true for the two screens the drawer is the only way into', () => {
    expect(returnsToDrawer('/account-settings')).toBe(true);
    expect(returnsToDrawer('/profile')).toBe(true);
  });

  // NOT EVERY DRAWER ROW. The other seventeen are reachable from bottom tabs, quick actions and each
  // other, so "you came from the drawer" would be a guess about one of several entry points.
  it('is false for the other routes the drawer can open', () => {
    for (const route of ['/privacy-policy', '/sync-queue', '/notifications', '/users', '/home']) {
      expect(returnsToDrawer(route)).toBe(false);
    }
  });

  // EXACT, NOT PREFIX. A `startsWith` test would also catch a future `/profile-something` — and
  // quietly, which is the kind of match nobody reviews.
  it('does not match a longer path that merely begins with one of them', () => {
    expect(returnsToDrawer('/profile-settings')).toBe(false);
    expect(returnsToDrawer('/account-settings/advanced')).toBe(false);
  });

  // `usePathname()` can be null before the router settles, and both call sites pass it straight in.
  it('is false for a null or undefined path rather than throwing', () => {
    expect(returnsToDrawer(null)).toBe(false);
    expect(returnsToDrawer(undefined)).toBe(false);
    expect(returnsToDrawer('')).toBe(false);
  });

  // `usePathname()` yields no group segment — `/account-settings`, never `/(app)/account-settings`.
  // If that ever changed, the feature would silently stop working rather than fail, so it is pinned.
  it('expects the group-less path expo-router actually reports', () => {
    expect(returnsToDrawer('/(app)/account-settings')).toBe(false);
    expect(DRAWER_RETURN_ROUTES.every((r) => r.startsWith('/') && !r.includes('('))).toBe(true);
  });
});
