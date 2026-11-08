---
title: Tenant Admin Flags Rollout
version: 1.1.0
last_updated: 2026-11-03
audience: Product owner, Platform Engineering, SYSTEM_ADMIN
---

# Tenant Admin Flags Rollout Runbook

Turning on the three ADR-110 flags in an environment. All three ship OFF (QM-15) and OFF is the behaviour before
ADR-110. They are switched in Unleash, per environment, by a person — this runbook is the order and the checks.

| Flag                              | What ON does                                                                                                   | Reversible                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `s1.tenant.bootstrap-admin`       | A SYSTEM_ADMIN can create, resend and cancel a tenant's first TENANT_ADMIN (panel actions and three endpoints) | Yes — OFF hides the actions, endpoints 503     |
| `s1.tenant.last-admin-guard`      | A tenant's users cannot deactivate or demote its last active TENANT_ADMIN (409 `COS-TADM-004`)                 | Yes — OFF lifts the refusal                    |
| `s1.identity.additional-role-mfa` | A TENANT_ADMIN / FINANCE held as an ADDITIONAL role needs a token that proved MFA (403 `COS-AUTH-001`)         | Yes — OFF restores the additional role at once |

Every flag is evaluated per tenant (and per user for the last one), so the QM-15 percentage rollout applies.

> **`s1.identity.additional-role-mfa` stays OFF in an environment until `docs/runbooks/mfa-enforcement.md` Step 4 is
> done there** (ADR-110 round 5): the round-5 backend deployed, `backfill-mfa-required.ts --apply` run, and the realm
> conditions switched to `mfa_required`. Before that, Keycloak asks for OTP from the PRIMARY role only, so anyone
> holding TENANT_ADMIN or FINANCE as an ADDITIONAL role would lose that role.

## Before any flag, in each environment

1. **Find the accounts the last flag would affect.** It reads, changes nothing, and prints tenant codes, user ids and
   roles only. Without a local `psql`, run it from the Postgres image (the connection string never leaves your shell):

   ```bash
   docker run --rm -i -e PSQL_URL="$PSQL_URL" -v "$PWD/scripts/readiness:/r:ro" \
     timescale/timescaledb:latest-pg18 bash /r/check-path-b-roles.sh
   ```

   Exit 0 = none. Exit 1 lists accounts that hold TENANT_ADMIN or FINANCE but have no email: decide each with its
   tenant (give the person an email account, or remove the role) before `s1.identity.additional-role-mfa` goes on —
   if the role is an additional one, they lose it the moment the flag reaches their tenant.

2. **Keycloak can send the invitation:** realm SMTP configured; the `cos` themes installed on that Keycloak
   (`infrastructure/keycloak/themes/cos`; nothing in `infrastructure/` deploys them yet) and the realm's
   `emailTheme` set to `cos`. Send one test invitation to an internal address and check it arrives in Thai and English.

3. **`MFA_ENFORCE=true`** on the backend, and the realm's MFA flows in place, including Step 4 (`mfa_required`)
   (`docs/runbooks/mfa-enforcement.md`). With `MFA_ENFORCE` off, `s1.identity.additional-role-mfa` only logs a
   warning — the same as for the primary role. Check with a user who holds FINANCE as an additional role only: a
   browser login asks for OTP and the token carries `acr=gold`.

4. **Staging first:** `tests/e2e/specs/admin-tenant-admin.spec.ts` passes on staging (needs `E2E_SYSADMIN_EMAIL` /
   `E2E_SYSADMIN_PASSWORD`).

## Order

1. `s1.tenant.bootstrap-admin` — on its own; it only adds SYSTEM_ADMIN actions.
2. `s1.tenant.last-admin-guard` — after 1 is at 100% (a tenant whose last admin is refused should be able to get help).
3. `s1.identity.additional-role-mfa` — last, after step 1 of "Before any flag" is settled.

For each: **1% → 10% → 50% → 100% of tenants, at least 24 hours at each step** (QM-15), then remove the flag from
code within 30 days of 100% (`docs/registers/feature-flag-cleanup-backlog.md`).

## What to watch at each step

| Flag                              | Watch                                                                                                                                  | Stop and switch OFF if                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `s1.tenant.bootstrap-admin`       | Global Audit Log `tenant.bootstrap_admin` / `resend_admin_invite` / `cancel_admin_invite`; backend logs `tenant_admin.invite.not_sent` | invitations are not sent (`invite_sent: false`) for every tenant — SMTP or theme |
| `s1.tenant.last-admin-guard`      | 409 `COS-TADM-004` rate on `/users` endpoints                                                                                          | a tenant reports it cannot make a needed change and has no other administrator   |
| `s1.identity.additional-role-mfa` | 403 `COS-AUTH-001` rate; log line `mfa.shortfall — additional privileged role`                                                         | support tickets from users who did enrol MFA but are refused                     |

## Kill switch

Set the flag OFF in Unleash. The backend polls every 15 s and the web every 30 s, so it takes effect within 60 s
(QM-15) — no deployment. Nothing these flags write needs undoing: the audit rows stay, and accounts created by the
bootstrap remain ordinary users.
