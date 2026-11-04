---
title: Trial Tenant Onboarding
version: 1.1.0
last_updated: 2026-11-03
audience: SYSTEM_ADMIN, Sales
---

# Trial Tenant Onboarding Runbook

Use this runbook when sales opens a free trial for a construction-os.io request (spec §7.10, ADR-109) and hands it to
the customer. A new tenant has **no user at all**, so until step 2 nobody can sign in and the trial notices reach
nobody (ADR-110).

**State.** The API steps are covered by unit tests and by
`backend/test/provisioning/04-tenant-admin-bootstrap.integration.spec.ts` and
`05-tenant-admin-bootstrap-http.integration.spec.ts` against a real PostgreSQL (Keycloak replaced by a double). The
email, link and first-sign-in steps were run against a real Keycloak 26.6.4 locally — see [Verification](#verification).
The staging run is still pending; QM-11 requires the whole runbook to be run in staging before the Stage transition.

## Before you start

- `s1.tenant.bootstrap-admin` is ON for the environment (Unleash). OFF, the _Create tenant admin_ action is hidden and
  the endpoints answer 503 `COS-FLAG-001`. Rollout: `docs/runbooks/tenant-admin-flags-rollout.md`
- The realm's SMTP server is configured (Keycloak admin console → Realm settings → Email). The development realm
  file points at the host `mailhog`, which `docker-compose.yml` runs under the `full` profile only
  (`docker compose --profile full up -d mailhog`; messages at <http://localhost:8025>). Without it, every local
  invitation reports "not sent"
- The `cos` themes are on the environment's Keycloak (`infrastructure/keycloak/themes/cos` — login and, since round 4,
  email) and the realm says `"emailTheme": "cos"`. Locally `docker-compose.yml` mounts them; **nothing in
  `infrastructure/` deploys them anywhere else yet**, so on staging/production the invitation falls back to
  Keycloak's English template until they are installed
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
- **Wrong address?** Use **Cancel admin invitation** on the row (while the invitation is unused): the account is
  deactivated and its sign-in account removed, and _Create tenant admin_ is offered again. The cancelled address
  cannot be used for a new account on the same sign-in realm (for the shared realm: any tenant). If the dialog says
  the sign-in account was **disabled instead**, the link no longer works — ask platform engineering to remove the
  account; if it says it could be **neither removed nor disabled**, the link may still work — ask them to remove it
  now (Keycloak admin console → realm → Users → the address → Delete)

## 3. If the link expired or never arrived

While the administrator has not signed in, the row shows **Resend admin invitation**. It sends a new 72-hour link;
an earlier link may still work until it expires. One invitation per tenant every 5 minutes — sooner is refused with
"wait five minutes". If the server answers that the invitation was already used, the customer has set a password and
should sign in or use "Forgot password". Once they have signed in, the action disappears: password help is their own
reset flow (sign-in page → "Forgot password", or another TENANT_ADMIN of the tenant).

## 4. Confirm the hand-over

The administrator opens the link, sets a password, signs in and enrols an authenticator app (MFA is required for
TENANT_ADMIN, `docs/runbooks/mfa-enforcement.md`). After their first request the row no longer offers _Resend_; the
§7.10 day-0 notice reaches them on the next daily run.

Every step is in the Global Audit Log: `tenant.create_trial`, `tenant.bootstrap_admin`, `tenant.resend_admin_invite`,
`tenant.cancel_admin_invite`.

## Verification

Run locally on 2026-11-03 against Keycloak **26.6.4** (the `docker-compose.yml` version) with this repository's realm
file, and a mail catcher on the Keycloak network under the host name the realm expects (`mailhog`). The account was
created and invited by the backend's own `KeycloakAdminService`; the browser steps were driven by Playwright.

| Check                                                 | Expected                                             | Result (2026-11-03, local)                                                                                                                             |
| ----------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Invitation for a fresh TENANT_ADMIN account           | Email arrives; link opens Keycloak "Update password" | Pass — (before the round-4 theme) subject "Update Your Account", "This link will expire within 3 days"; form shown                                     |
| Link lifetime                                         | 72 hours                                             | Pass — action token `exp − iat` = 259,200 s                                                                                                            |
| Credential check before / after the link is used      | `false` / `true` (what resend and cancel rely on)    | Pass — `false`, then `true` (measured with the round-2 `hasPassword`; round 4 widened it to any credential, `hasAnyCredential`)                        |
| The same link a second time                           | Refused                                              | Pass — "Action expired"                                                                                                                                |
| An earlier link after a resend                        | (documented as possibly still valid)                 | Confirmed — the older link still opened "Update password" after a second invitation                                                                    |
| First sign-in after setting the password              | Forced to set up the authenticator app               | Pass — "Mobile Authenticator Setup — You need to set up Mobile Authenticator to activate your account"                                                 |
| Bilingual email theme `cos` (round 4)                 | Subject and body Thai, then English; link works      | Pass — both parts present, two links in the HTML, the link opens "Update password"; the lifetime reads "3 days" in both parts (one locale per message) |
| Tenant List after first sign-in                       | _Resend admin invitation_ no longer offered          | Not run here (needs the web app against this Keycloak) — covered by the staging spec below                                                             |
| Staging: `tests/e2e/specs/admin-tenant-admin.spec.ts` | Passes with `E2E_SYSADMIN_EMAIL` / `_PASSWORD` set   | **Not yet run** — needs a staging SYSTEM_ADMIN and the two secrets                                                                                     |

Findings from the run, and what became of them:

- The invitation email was Keycloak's generic **English** template (QM-3). Fixed in round 4: the `cos` email theme
  writes it in Thai, then English.
- On the development realm imported as `construction-os-dev`, the `account-console` client's redirect URIs pointed at
  `/realms/construction-os/…`, so the account console could not be used to sign in there. Fixed in round 4: the
  redirect URIs name `construction-os-dev`.
