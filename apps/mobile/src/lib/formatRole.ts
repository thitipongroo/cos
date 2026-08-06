// Role enum → something a person can read.
//
// This function existed six times, byte-identical, in edit-permission, invitation-success,
// invite-user, reset-password, role-permissions and now the identity transparency screen. Six copies
// is six chances for one of them to drift, and a role rendered two different ways on two screens is
// the kind of inconsistency nobody files a bug about but everybody notices.

/**
 * `'PROJECT_MANAGER'` → `'Project Manager'`.
 *
 * Deliberately NOT a translation. Role identifiers are the platform's own vocabulary — they appear
 * in the API, in audit entries and in support conversations — so the display form stays a
 * mechanical transform of the identifier rather than a per-locale name that would no longer match
 * what a support engineer sees in the logs. Where a role needs a real translated description, the
 * `inviteUser.roleDesc.*` keys carry it.
 *
 * `toLowerCase()` on the tail rather than a locale-aware transform: the identifiers are ASCII by
 * construction, and a locale-aware lowercase would turn `I` into `ı` under a Turkish locale.
 */
export function formatRole(role: string): string {
  return role
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}
