---
title: Trial Tenant Onboarding
version: 1.0.0
last_updated: 2026-11-02
audience: SYSTEM_ADMIN, Sales
---

# Trial Tenant Onboarding Runbook

Use this runbook when sales opens a free trial for a construction-os.io request (spec §7.10, ADR-109) and hands it to
the customer. A new tenant has **no user at all**, so until step 2 nobody can sign in and the trial notices reach
nobody (ADR-110).

**State.** The two API steps are covered by unit tests and by `backend/test/provisioning/04-tenant-admin-bootstrap.integration.spec.ts` and `05-tenant-admin-bootstrap-http.integration.spec.ts`
against a real PostgreSQL (Keycloak replaced by a double). **The email and first-sign-in steps have not been run
against a real Keycloak yet** — see [Verification](#verification). QM-11 requires the whole runbook to be run in
staging before the Stage transition.

## Before you start

- `s1.tenant.bootstrap-admin` is ON for the environment (Unleash). OFF, the _Create tenant admin_ action is hidden and
  the endpoints answer 503
- The realm's SMTP server is configured (Keycloak admin console → Realm settings → Email). The development realm
  file points at a host `mailhog`, which `docker-compose.yml` does not run — locally, every invitation reports
  "not sent" until a mail catcher is added
- The customer's administrator: full name and work email. One email can be an account in only one tenant on the
  shared realm (§7.6 step 3)

## 1. Open the trial

Admin panel → Tenant List → **Start free trial**: tenant code, name, plan, the website source and request ID, and the
justification. The tenant appears with the TRIAL badge.

## 2. Create the tenant admin

On the new tenant's row (or in Tenant Detail) → **Create tenant admin** (shield icon): name, email, justification →
**Create and send invitation**.

- "Invitation sent to …, link valid until …" — done. Tell the customer to look for the email from Construction OS
  (check spam), and that the link works once and for 72 hours
- "The account was created, but the invitation email could not be sent" — fix SMTP, then step 3
- "This tenant already has an administrator" — someone already did step 2; nothing to do
- "This email already has an account" — the address belongs to another tenant on the shared realm; ask for another
- **A wrong address cannot be fixed from the panel** (ADR-110 open question). Check the email with the customer
  before you submit

## 3. If the link expired or never arrived

While the administrator has not signed in, the row shows **Resend admin invitation**. It sends a new 72-hour link;
an earlier link may still work until it expires. If the server answers that the invitation was already used, the
customer has set a password and should sign in or use "Forgot password". Once they have signed in, the action
disappears: password help is their own reset flow
(sign-in page → "Forgot password", or another TENANT_ADMIN of the tenant).

## 4. Confirm the hand-over

The administrator opens the link, sets a password, signs in and enrols an authenticator app (MFA is required for
TENANT_ADMIN, `docs/runbooks/mfa-enforcement.md`). After their first request the row no longer offers _Resend_; the
§7.10 day-0 notice reaches them on the next daily run.

Every step is in the Global Audit Log: `tenant.create_trial`, `tenant.bootstrap_admin`, `tenant.resend_admin_invite`.

## Verification

Run locally on 2026-11-03 against Keycloak **26.6.4** (the `docker-compose.yml` version) with this repository's realm
file, and a mail catcher on the Keycloak network under the host name the realm expects (`mailhog`). The account was
created and invited by the backend's own `KeycloakAdminService`; the browser steps were driven by Playwright.

| Check                                                 | Expected                                             | Result (2026-11-03, local)                                                                             |
| ----------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Invitation for a fresh TENANT_ADMIN account           | Email arrives; link opens Keycloak "Update password" | Pass — subject "Update Your Account", "This link will expire within 3 days"; form shown                |
| Link lifetime                                         | 72 hours                                             | Pass — action token `exp − iat` = 259,200 s                                                            |
| `hasPassword` before / after the link is used         | `false` / `true` (what resend relies on)             | Pass — `false`, then `true`                                                                            |
| The same link a second time                           | Refused                                              | Pass — "Action expired"                                                                                |
| An earlier link after a resend                        | (documented as possibly still valid)                 | Confirmed — the older link still opened "Update password" after a second invitation                    |
| First sign-in after setting the password              | Forced to set up the authenticator app               | Pass — "Mobile Authenticator Setup — You need to set up Mobile Authenticator to activate your account" |
| Tenant List after first sign-in                       | _Resend admin invitation_ no longer offered          | Not run here (needs the web app against this Keycloak) — covered by the staging spec below             |
| Staging: `tests/e2e/specs/admin-tenant-admin.spec.ts` | Passes with `E2E_SYSADMIN_EMAIL` / `_PASSWORD` set   | **Not yet run** — needs a staging SYSTEM_ADMIN and the two secrets                                     |

Findings from the run:

- The invitation email is Keycloak's generic **English** "Update Your Account" template. QM-3 asks for Thai and
  English; a Thai email needs the realm's email theme or `internationalizationEnabled` — not part of ADR-110.
- On the development realm imported as `construction-os-dev`, the `account-console` client's redirect URIs point at
  `/realms/construction-os/…`, so the account console cannot be used to sign in there; the check used `cos-web`.
