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
- **Wrong address?** Use **Cancel admin invitation** on the row (while the invitation is unused): the account is
  deactivated and its sign-in account removed, and _Create tenant admin_ is offered again. The cancelled address
  cannot be used for a new account on the same sign-in realm (for the shared realm: any tenant). If the dialog says
  the sign-in account was **disabled instead**, the link no longer works — ask platform engineering to remove the
  account; if it says it could be **neither removed nor disabled**, the link may still work — ask them to remove it
  now (Keycloak admin console → realm → Users → the address → Delete)
- The invitation email is Keycloak's generic **English** "Update Your Account" template. QM-3 asks for Thai and
  English; a Thai email needs the realm's email theme or `internationalizationEnabled` — not part of ADR-110.
- On the development realm imported as `construction-os-dev`, the `account-console` client's redirect URIs point at
  `/realms/construction-os/…`, so the account console cannot be used to sign in there; the check used `cos-web`.
