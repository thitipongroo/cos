// Every role, checked against §6.8 — because the interesting case is the one nobody thought of.
//
// A test that only asserted "VIEWER cannot write" would pass on a function that returned false for
// everyone. Enumerating `CosRole` means a role added later arrives here as a failure rather than as
// a silently-denied write control.

import { CosRole } from '@cos/types';
import { canRenderWriteControls, isReadOnlyRole } from '../readOnlyRole';

/** §6.8: "Viewer does not have write, delete, or approve access on any module." */
const READ_ONLY: readonly CosRole[] = [CosRole.VIEWER];

describe('isReadOnlyRole', () => {
  it.each(Object.values(CosRole))('classifies %s the way §6.8 does', (role) => {
    expect(isReadOnlyRole(role)).toBe(READ_ONLY.includes(role));
  });

  it('does not classify an unknown session as the read-only ROLE', () => {
    // `null` is "we do not know", not "VIEWER". The distinction matters because the second half of
    // this test is what the screens branch on, and hiding controls for an unknown role would make
    // every role's buttons appear a frame late while the store is read back — a regression for
    // eleven roles guarding a state `AuthGate` already keeps out of the `(app)` group.
    expect(isReadOnlyRole(null)).toBe(false);
    expect(isReadOnlyRole(undefined)).toBe(false);
    expect(canRenderWriteControls(null)).toBe(true);
    expect(canRenderWriteControls(undefined)).toBe(true);
  });
});

describe('canRenderWriteControls', () => {
  it.each(Object.values(CosRole))('is the inverse of the read-only test for %s', (role) => {
    expect(canRenderWriteControls(role)).toBe(!isReadOnlyRole(role));
  });

  it('lets exactly the roles §6.8 grants a write render one', () => {
    const allowed = Object.values(CosRole).filter((r) => canRenderWriteControls(r));
    expect(allowed).not.toContain(CosRole.VIEWER);
    // Sanity that the function is not simply false everywhere — the failure mode a
    // VIEWER-only assertion could not see.
    expect(allowed.length).toBe(Object.values(CosRole).length - READ_ONLY.length);
  });
});
