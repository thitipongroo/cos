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
   and its invitation is unused — Keycloak holds no password credential for it, which a fresh Path B account never
   has. Otherwise `409 COS-TADM-002` with `details.reason` (`admin_count`, `not_bootstrapped`, `invitation_used`). The
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
- A mistyped email cannot be corrected by the operator: the account counts as the tenant's administrator, so a new
  bootstrap is refused, and resend goes to the same address. Recovery needs a decision not taken here (see Open
  questions)
- "No ACTIVE administrator" is checked, not "never had one": if the customer's only administrator is later
  deactivated or demoted, a SYSTEM_ADMIN can bootstrap a new one. This is what the product owner chose (2026-11-02,
  "only while the tenant has no active TENANT_ADMIN"); it is also the only recovery for a locked-out tenant
- `FeatureFlagGuard`'s 503 body has no `error` envelope, so clients see `COS-GENERAL-503` rather than `COS-FLAG-001`
  (pre-existing, `http-exception.filter.ts`); the panel maps 503 to "switched off" for these endpoints

### Neutral

- Self-service signup, when it comes, will create its first administrator through the same `UserService.createUser`
  path

## Open questions

- **Correcting a wrong email.** The operator has no way to deactivate or re-address a bootstrapped administrator
  whose invitation is unused. Options for the product owner: allow `PATCH …/tenant-admin` (re-address) while the
  invitation is unused, or allow the operator to deactivate that one account. Until decided, the fix is a manual,
  audited database change.

## References

- `docs/specifications/07-multi-tenant-architecture.md` §7.6 step 10, §7.10 Client surfaces
- `docs/specifications/06-rbac-permission-matrix.md` §6.7 Tenant bootstrap
- `docs/specifications/05-security-compliance.md` §5.4.4
- ADR-109 (trial lifecycle), ADR-067 (MFA)
- `backend/src/modules/tenant/tenant-admin-bootstrap.service.ts`
