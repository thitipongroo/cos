# ADR-104: A user changes their own password through Keycloak's email, not through COS

**Date:** 2026-09-13
**Status:** Accepted
**Deciders:** Product Owner (decision E3, then the mechanism on the same day)
**Tags:** backend | identity | security | mobile

---

## Context

The Stitch drawing "Account & Notification Settings - Site Engineer (Unified)" carries a **Password**
row under Security & Access, with a `Change` action and a `Last changed` line. Nothing behind it
existed: `users/me` had exactly two routes, `GET me` and `PATCH me/photo`, and the only password
surface in the product was the TENANT_ADMIN pair on `UserController` — `resetPassword`, which hands
an admin a one-time temporary password to pass on, and `sendPasswordResetLink`, which emails a
target user a Keycloak action-token link.

The product owner chose to build the row for real rather than draw it (decision E3, 2026-09-13)
— a dead control over a real field is the failure ADR-099 exists to end.

**The obvious design does not work here, and finding out why is the substance of this ADR.** The
plan first said: take the current password, verify it by Direct Grant, then set the new one. That is
the standard shape, and it is unusable for the two roles it matters most for.

`docs/runbooks/mfa-enforcement.md` Step 1b binds `direct-grant-mfa` as **the realm's Direct Grant
flow**, with a `Deny access` execution for `TENANT_ADMIN` and `FINANCE`
(`denyErrorMessage` = "This role must sign in with email and password.", verified against a live
Keycloak 2026-08-22). §5.4.4 of `05-security-compliance.md` makes both roles **Path B only**, for
two independent reasons: MFA cannot be enforced on Path A, and SMS is a restricted authenticator
under NIST SP 800-63B Rev 4.

Put together: **the accounts guaranteed to have a password are exactly the accounts guaranteed to be
refused when verifying one.** A TENANT_ADMIN typing their correct current password would get
`invalid_grant` from the identity provider, and COS would have to report either "wrong password"
(false) or "the identity provider declined" (true and useless).

A second Keycloak client configured to bypass that deny was considered and **rejected outright**. It
would reopen a Direct Grant path for a privileged account, which is the precise thing Step 1b exists
to prevent — and it would do so on an endpoint any authenticated caller can reach.

## Decision

1. **`POST /api/v1/users/me/password-reset-email`** on `UserMeController`. No `@Roles`, like every
   route on that controller: the target is the JWT's own `user_id`, and the route takes **no body
   and no path parameter**, so there is nothing for a caller to point at another account.
2. **It sends Keycloak's `UPDATE_PASSWORD` action-token email** through the existing
   `KeycloakAdminService.sendPasswordResetEmail`, with a **900-second** lifespan. Single-use, short,
   over a separate channel; the user sets the password inside Keycloak and **COS never handles a
   plaintext credential** — not the old one and not the new one.
3. **A Path A account is refused**, with `COS-AUTH-003` / `user.password.pathAHasNoPassword` —
   not reported as sent.
4. **`platform.users.password_changed_at`** (migration `20260913000001`, nullable, with a rollback)
   backs the `Last changed` line. It is written by **the admin temporary reset only**. The surface
   prints nothing when it is NULL.

## Rationale

**Why the action-token email rather than in-app verification.** Beyond the Step 1b deadlock above:
the email is proof of possession over a channel separate from the session asking for the change,
which is what NIST SP 800-63B Rev 4 wants of a reset. Not asking for the old password gives nothing
away — an attacker with the live session that could call this endpoint would already be able to use
the app as that user; what they do not have is the mailbox.

**Why no new Keycloak code.** `sendPasswordResetEmail` already existed for the admin-initiated
reset and was already exercised. The self-service route is the same call with the target taken from
the JWT instead of a path parameter — the only new security-relevant line is where the id comes
from, which is the line easiest to review.

**Why Path A is refused rather than silently succeeded.** A phone-only account holds a phone number
and `email = ''` by design (§5.4.4, one identifier per account for its lifetime), and
`provisionPhoneUser` creates the Keycloak user with **no credential** — `exchangeOtpForTokens`
writes a random UUID on every login. There is no address to send to and no password its owner could
set. A friendly "check your email" would be a claim the user can only disprove by waiting for mail
that can never arrive.

**Why the row is ABSENT on Path A rather than disabled.** A disabled control says "not now"; the
truth is "never, on this account". The client can already tell the paths apart —
`GET /users/me` returns both `email` and `phone_number` — so no new field is needed to decide.

**Why `password_changed_at` is not written when the link is sent.** The flow completes inside
Keycloak and calls nothing back. Stamping on send would record a change the user may never finish
making, and `Last changed` would then be a date on which nothing happened. The admin temporary reset
is the one credential set that still passes through this service, so it is the only writer, and the
stamp goes **after** Keycloak accepts — a row written ahead of a failed call would claim a change
that did not occur.

**Why `COS-AUTH-003` and not `COS-AUTH-002`.** `COS-AUTH-001` and `COS-AUTH-002` each already carry
two unrelated meanings in the code, predating any of them being registered. Both collisions are now
recorded in `docs/api/error-codes.md`; a fresh number avoids making one of them a triple.

## Consequences

### Positive

- The drawing's Password row is a real control on every Path B account, of every role, including the
  two the in-app design would have locked out.
- No plaintext credential enters COS on the self-service path, and no new Direct Grant client
  exists for a privileged role to be attacked through.
- `Last changed` is honest about what it knows: a lower bound on recency, silent when unobserved,
  rather than a fabricated "never".

### Negative

- **`password_changed_at` will read NULL for almost every account, probably forever.** The mechanism
  that users actually reach does not write it, by construction. The line is silent in that case, so
  the cost is a feature that mostly does not show rather than a wrong date — but the column is far
  less useful than its name suggests, and its comments say so in the schema, in the migration and on
  `MeRow`.
- **A user with no access to their mailbox cannot self-serve.** Their route back is the admin reset,
  which already exists. This is the same dependency every emailed reset carries.
- The endpoint can be called repeatedly; rate limiting is the global throttler's, not this route's.
  Each call invalidates the previous token (Keycloak action tokens are single-use), so the cost is
  mail volume rather than a widened window.
- One more route on the not-role-gated surface. It is scoped by the JWT and takes no input, which is
  the narrowest shape available, and the integration spec signs in as `SITE_ENGINEER` specifically
  so a copy-pasted `@Roles(TENANT_ADMIN)` would turn the suite red.

### Rollback

`backend/prisma/rollbacks/20260913000001_user_password_changed_at.rollback.sql` drops the column.
**The application must be rolled back with it**: `getMe` names the column explicitly and fails
against a database without it. The mobile app degrades cleanly — `Me.password_changed_at` is
optional (QM-9) and the row draws no `Last changed` line when the key is absent. Dropping the column
destroys the stamps and they cannot be reconstructed; Keycloak does not hold them.

## References

- `docs/runbooks/mfa-enforcement.md` Step 1b — the `Deny access` execution that rules out in-app
  verification
- `docs/specifications/05-security-compliance.md` §5.4.4 — Path A / Path B, one identifier per
  account, and why TENANT_ADMIN / FINANCE are Path B only
- `docs/specifications/14-api-architecture.md` — the `users/me` self-service route table
- `docs/assessments/sms-otp-restricted-authenticator.md` — NIST SP 800-63B Rev 4 on SMS
- `docs/api/error-codes.md` — `COS-AUTH-003`, and the two pre-existing collisions
- ADR-085 — mockups are authoritative for style, not composition
- ADR-099 — a drawn figure with no data source behind it
