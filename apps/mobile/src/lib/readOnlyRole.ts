// Which signed-in roles must never be SHOWN a create, edit or approve control.
//
// §20.7.9 says of VIEWER, in these words: "No create/edit/approve actions are rendered." §6.8 ends
// its permission table with "Viewer does not have write, delete, or approve access on any module."
// Both are about the SCREEN, not the server — a control that 403s when pressed still breaks the
// rule, because the reader was offered something they may not do.
//
// ── WHY THIS IS A MODULE AND NOT A LINE OF CODE IN SIX SCREENS ─────────────────────────────────
//
// §32.7 justified VIEWER's tab set with an audit run on 2026-08-04: the three screens chosen
// "were each verified to contain no `onPress`/`Pressable` at all". That was true on the day, and
// it decayed on its own. `/procurement` was rebuilt into the manager's dashboard on 2026-08-10 and
// grew an APPROVE button; `/budget` was rebuilt for the FINANCE drawing on 2026-09-08 and grew a
// "request an amendment"; four more screens this role reaches through the DRAWER — which the audit
// never covered — grew write controls of their own. A re-audit on 2026-09-11 found SEVEN routes of
// the seventeen a VIEWER can reach rendering a mutating control.
//
// A one-line role check copied into seven files decays the same way. This is the one place, and
// `readOnlyRole.spec.ts` plus the render tests are what stop the eighth appearing unnoticed.
//
// PURE, and in `lib/` for that reason: the node-environment suite holds it at 100% lines and
// branches (QM-1), which a screen-level check could only be tested through indirectly.

import { CosRole } from '@cos/types';

/**
 * True when this role may be SHOWN a control that changes something.
 *
 * The inverse of `isReadOnlyRole`, and the direction most call sites want — `canWrite && <Button/>`
 * reads as a permission, where `!isReadOnly && …` is a double negative at the point it matters
 * most.
 *
 * ── A NULL ROLE MAY BE SHOWN ONE, AND THE FIRST VERSION OF THIS FUNCTION SAID OTHERWISE ─────────
 *
 * `role != null && …` looked like the careful choice and was the wrong one, for two reasons that
 * only appear once it is written down.
 *
 * IT GUARDS A STATE THAT CANNOT REACH THESE SCREENS. `AuthGate` in `app/_layout.tsx` redirects an
 * unauthenticated session out of the `(app)` group entirely, and both sign-in paths set the role
 * from the same JWT that sets `isAuthenticated`. A null role inside `(app)` is a test fixture, not
 * a session.
 *
 * AND IT COSTS THE OTHER ELEVEN ROLES SOMETHING REAL. Hiding a control while the store is being
 * read back means every role watches its buttons appear a frame late — a regression for everyone,
 * to defend against nobody.
 *
 * THE SECURITY GATE IS NOT HERE. This function implements §20.7.9, which is about what a screen
 * RENDERS. What a role may actually do is decided by `@Roles` on the route: ADR-103 opened six READ
 * routes to VIEWER and left every write and approve shut, with
 * `backend/src/shared/guards/__tests__/viewer-read-routes.spec.ts` holding that. A button shown by
 * mistake is a presentation bug; it is not an authorisation hole.
 */
export function canRenderWriteControls(role: CosRole | null | undefined): boolean {
  return !isReadOnlyRole(role);
}

/**
 * True for a role the specification defines as read-only across every module it can see.
 *
 * VIEWER is the only one today, and the function exists rather than the comparison because the
 * next such role — an auditor, an external stakeholder, a client-side reviewer — is a plausible
 * addition, and adding it here is one edit rather than seven.
 */
export function isReadOnlyRole(role: CosRole | null | undefined): boolean {
  return role === CosRole.VIEWER;
}
