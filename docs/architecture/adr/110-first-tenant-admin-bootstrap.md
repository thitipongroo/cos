# ADR-110: First TENANT_ADMIN of a tenant, created by a SYSTEM_ADMIN

**Date:** 2026-11-02
**Status:** Accepted
**Deciders:** product owner, 2026-11-02
**Tags:** security | identity

---

## Context

Creating a tenant (`POST /admin/tenants`, `POST /admin/tenants/trial`) writes no user. Every user-management endpoint
is `@Roles(TENANT_ADMIN)` and acts inside the caller's own tenant, and §6.7 gives a SYSTEM_ADMIN no user management
inside a customer tenant. §6.6 seeds "Tenant Admin (1 seat)" and §7.6 sends a "welcome notification … to tenant
admin", but no section said how that first person comes to exist.

So a tenant opened for a free trial had nobody who could sign in, and the §7.10 notices (to `TENANT_ADMIN` and
`EXECUTIVE`) reached nobody and were retried every day. Self-service signup (ADR-109 decision 5, "comes later") would
close this for self-served trials only; sales-assisted trials and paying tenants need it now.

The product owner decided on 2026-11-02:

1. close this gap only — no self-service signup
2. the credential reaches the customer as a Keycloak invitation email, valid 72 hours, in which they set their own
   password; a SYSTEM_ADMIN can resend it when it expires
3. a SYSTEM_ADMIN may do this **only while the tenant has no active TENANT_ADMIN**
4. the action is its own button in the Tenant List and Tenant Detail, not a field of the trial form

## Decision

1. **`POST /api/v1/admin/tenants/{tenantId}/tenant-admin`** (SYSTEM_ADMIN, body `email`, `display_name`,
   `justification`) creates a Path B account with role `TENANT_ADMIN` through `UserService.createUser` — the same
   Keycloak provisioning, realm-wide email conflict guard, Keycloak rollback and `identity.user.created.v1` event as a
   TENANT_ADMIN creating a user. Path B because TENANT_ADMIN is Path B only (§5.4.4).
2. **The invitation** is Keycloak's `executeActionsEmail(UPDATE_PASSWORD)` with a lifespan of 259,200 s, sent after
   the account commits. A mail failure does not undo a correct account: the response says `invite_sent: false` and
   the operator resends. MFA is enrolled at first sign-in by the realm's browser flow, as for any TENANT_ADMIN
   (`docs/runbooks/mfa-enforcement.md`).
3. **"No administrator" is checked twice.** Before Keycloak is called, so the common refusal creates nothing; and
   inside the insert transaction, after a per-tenant `pg_advisory_xact_lock`, excluding the row just inserted — so
   two SYSTEM_ADMINs at once cannot both succeed. The loser's transaction rolls back and its Keycloak account is
   deleted. Refusal is `409 COS-TADM-001`. An administrator is an active user holding `TENANT_ADMIN` as primary or
   additional role, the union RolesGuard authorises; the list and the guard share one definition
   (`tenant/public/tenant-admins.ts`).
4. **`POST …/tenant-admin/invite`** resends only when, read with the tenant row locked `FOR SHARE` and under the same
   advisory lock: the tenant has exactly one active administrator; that account was created by the bootstrap (a
   `tenant.bootstrap_admin` audit row names it — an administrator the customer made is not the operator's to touch);
   and its invitation is unused — Keycloak holds no credential of any kind for it, which a fresh Path B account never
   has (any kind, because the realm allows passwordless WebAuthn registration; the realm has no identity provider
   configured — if one is added, a federated sign-in must be added to this test). Keycloak is asked BEFORE the
   transaction (QM-18), and inside it, under the lock, the same account must still be the only active administrator;
   a credential added in that window of one round trip is not seen. Otherwise `409 COS-TADM-002` with `details.reason` (`admin_count`, `not_bootstrapped`, `invitation_used`). The
   audit row commits before the email is sent, so every email that leaves is recorded; a failed send leaves the
   recorded request and `invite_sent: false`. Keycloak does not revoke an earlier action token when a new one is
   issued, so an earlier link may stay valid until its own expiry.
   The list's `tenant_admin_pending` (`last_seen_at = created_at`: both default to `now()` in the same INSERT and
   `LastSeenService` moves `last_seen_at` on the first authenticated request) only decides whether the panel shows
   the button; the server decides by the Keycloak credential.
5. **Audited** under the target tenant with the justification (§6.7): `tenant.bootstrap_admin` in the insert
   transaction, `tenant.resend_admin_invite` in the resend transaction, before its email. Metadata is the justification and `user_id` —
   no email.
6. **`GET /admin/tenants`** carries `tenant_admin_count` and `tenant_admin_pending`, from which the panel offers
   _Create tenant admin_ (count 0) or _Resend admin invitation_ (pending).
7. **Feature flag `s1.tenant.bootstrap-admin`** (QM-15), default OFF, on both endpoints (503 `COS-FLAG-001`) and on
   the two panel actions.

## Rationale

| Option                                                | Why not                                                                                                                                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A temporary password shown once to the SYSTEM_ADMIN   | A person at the operator sees a customer administrator's credential, and it travels by whatever channel sales uses. The invitation keeps the password with the customer        |
| The existing 15-minute reset link                     | Right for a reset the user asked for; an invitation is read hours later                                                                                                        |
| Unrestricted SYSTEM_ADMIN user creation in any tenant | A standing cross-tenant write into the customer's user base, which §6.7 does not grant. The bootstrap stops being possible the moment the customer has an administrator        |
| Fields in the Start-free-trial form                   | One action that can half-succeed (tenant created, invitation failed) instead of two that each succeed or fail; the separate action also serves tenants created before this ADR |

The read-only rule (§7.10) does not apply: `TrialReadOnlyInterceptor` reads the CALLER's tenant, and a SYSTEM_ADMIN's
home tenant is not a trial. An expired trial can still be given its administrator, to export data or to convert.

## Consequences

### Positive

- A new tenant can be handed over without database access, and the §7.10 notices reach someone
- No password is ever seen by the operator or by COS

### Negative

- The invitation email depends on the realm's SMTP configuration; with none, every bootstrap reports
  `invite_sent: false`
- `tenant_admin_pending` relies on `LastSeenService` writing `last_seen_at`, which is best-effort (a failed write is
  not retried for 15 minutes on that pod) and skipped when MFA enforcement rejects the request; the panel may then
  offer _Resend_ to an administrator who is in, and the server refuses it (`invitation_used`)
- A cancelled address cannot be reused on that realm: the realm-wide email guard counts inactive accounts. The
  operator bootstraps with the corrected address, which is what the cancel is for
- With `s1.tenant.last-admin-guard` OFF, a customer can still deactivate or demote its last administrator, and then
  a SYSTEM_ADMIN can bootstrap a new one ("no ACTIVE administrator" is the rule). The guard is what closes that path
  once it is rolled out
- `FeatureFlagGuard`'s 503 body has no `error` envelope, so clients see `COS-GENERAL-503` rather than `COS-FLAG-001`
  (pre-existing, `http-exception.filter.ts`); the panel maps 503 to "switched off" for these endpoints

### Neutral

- Self-service signup, when it comes, will create its first administrator through the same `UserService.createUser`
  path

## Amendment — round 2 (product owner, 2026-11-03)

Decided after the Rule 41 review of the first round:

8. **Cancel an unused invitation** (`POST …/tenant-admin/cancel`, 409 `COS-TADM-003` otherwise) — the fix for a
   mistyped address. Same conditions as resend; the account is deactivated and the cancel audited
   (`tenant.cancel_admin_invite`) in one transaction, then its Keycloak account is deleted, which kills the link.
   Re-addressing in place was rejected: the old link would stay valid until it expires, at the wrong address.
9. **Guard the last administrator** (`s1.tenant.last-admin-guard`, default OFF): `UserService.changeRole`,
   `setUserRoles` and `deactivateUser` take the administrator lock first and, after their write, refuse with 409
   `COS-TADM-004` when the tenant has no active TENANT_ADMIN left. A tenant can then lose its administrator only by a
   SYSTEM_ADMIN cancel or a PDPA erasure (see below), so the bootstrap becomes what §6.7 says — the FIRST
   administrator of a tenant that has none.
10. **Resend rule** confirmed as in decision 4 (it replaced a `last_seen_at IS NULL` test the column could never
    satisfy).

All writers of a tenant's administrator set take `pg_advisory_xact_lock(hashtextextended('cos:tenant-admin:<id>', 0))`
before the rows they update, so none waits on another in the opposite order (`tenant/public/tenant-admins.ts`).

Review of round 2 (Rule 41, 2026-11-03) changed it as follows:

- **Whether an administrator has an email does not matter** to the count (list, bootstrap, guard). Round 3 briefly
  required one and its review reversed it: Keycloak's Path B gate reads only the PRIMARY role attribute, so a
  phone-only account holding TENANT_ADMIN as an ADDITIONAL role signs in by OTP and acts as an administrator —
  without MFA, which `MfaEnforcement` checks on the primary role only. That is a pre-existing gap; round 3 stops new
  grants of it (decisions 11 and 14), and the readiness script lists existing ones.
- **Cancel falls back** to disabling the Keycloak account when the delete fails (`keycloak: deleted | disabled |
failed`); a 404 counts as deleted.
- **The guard refuses only a write that took the last administrator away** (it reads whether the changed user was an
  administrator before the write), never a change to someone else in a tenant that already has none.
- **Not covered by the guard, on purpose:** PDPA erasure (`subject-request.repository.ts`) deactivates an account
  without the lock or the check — a statutory erasure is never refused — so it can leave a tenant with no
  administrator; the bootstrap is then the recovery. And while the flag rolls out, pods can disagree for up to the
  QM-15 propagation window (≤ 60 s): a writer on a pod that still reads it OFF takes no lock, so the guarantee holds
  from the moment every pod reads it ON, not from the moment it is switched.

## Amendment — round 3 (product owner, 2026-11-03)

11. **`setUserRoles` refuses TENANT_ADMIN and FINANCE that it GRANTS to an account with no email**, as the primary role
    or an additional one, with `400 COS-AUTH-002` before any write — the check `changeRole` has made since TDD OQ-11, in
    one shared function (`assertPathBRolesHaveEmail`). Only roles the call grants are checked, so an account that
    already holds one (see 13) can still have its other roles edited while it is settled. The membership
    row is locked `FOR UPDATE` and the users row `FOR SHARE`, so the email cannot change under the check. `changeRole`
    keeps its own rule unchanged: it checks the role it sets, even when the account already holds it, and it reads the
    email without a lock (as before).
12. **No feature flag.** QM-15 asks for one on a change to authorization logic; this is the documented exception: it
    refuses an invalid state and grants nothing, and the `changeRole` check it mirrors has shipped unflagged. Turning
    it off could only re-open the lock-out.
13. **Existing accounts** are not changed. `scripts/readiness/check-path-b-roles.sh` lists active accounts in active
    tenants that already hold either role with no email, for the product owner to settle per tenant. "No email" is
    `btrim(email) = ''` there and `trim() === ''` in the API. Inactive users and tenants are not listed; one that is
    reactivated should be checked again. A Path A account that ALSO carries an email (the dev seed
    `scripts/dev/seed-e2e-users.sh` makes one; §5.4.4 says one account carries one identifier) is not caught by the
    email test — such accounts are outside §5.4.4 and are not created by the API.
14. **`createUser`** (`POST /users`) refuses a phone-number account with TENANT_ADMIN or FINANCE with the same
    `400 COS-AUTH-002`, before Keycloak is called (review of round 3; product owner, 2026-11-03). All three writers of a
    role now use `assertPathBRolesHaveEmail`.

## References

- `docs/specifications/07-multi-tenant-architecture.md` §7.6 step 10, §7.10 Client surfaces
- `docs/specifications/06-rbac-permission-matrix.md` §6.7 Tenant bootstrap
- `docs/specifications/05-security-compliance.md` §5.4.4
- ADR-109 (trial lifecycle), ADR-067 (MFA)
- `backend/src/modules/tenant/tenant-admin-bootstrap.service.ts`
