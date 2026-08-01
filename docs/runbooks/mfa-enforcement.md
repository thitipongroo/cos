# Runbook — MFA Enforcement for TENANT_ADMIN / FINANCE (spec §5.4.1)

MFA (TOTP) is **required** for the `TENANT_ADMIN` and `FINANCE` roles (Path B office users). Enforcement is
two layers:

- **Layer 1 — Keycloak (authoritative):** the browser login flow forces OTP for these roles, so a user in
  those roles cannot complete login without configuring + entering a TOTP code.
- **Layer 2 — backend (defense-in-depth):** `JwtAuthGuard` calls `enforceMfaForPrivilegedRoles`
  (`backend/src/shared/guards/mfa-enforcement.ts`), which rejects a privileged token whose `acr` claim does
  not prove OTP. It is **gated by `MFA_ENFORCE` (default off)** so it ships before Layer 1 is verified —
  enforcing against a realm that does not yet emit the expected `acr` would lock out every privileged user.

> ⚠️ **Why Layer 1 is not a blind realm-JSON edit.** The realm file (`infrastructure/keycloak/realms/
construction-os-realm.json`) has no `authenticatorConfig` array or realm-level `attributes` block, and this
> repo has no running Keycloak to validate an import against. A malformed authentication-flow import breaks
> **all** logins. So Layer 1 is applied + verified against a live Keycloak using the steps below, then the
> corrected realm is exported back to git.

---

## Step 1 — Keycloak: force OTP for the two roles (Layer 1)

In the Keycloak Admin Console for realm `construction-os` (repeat for each ENTERPRISE realm `cos-{tenantCode}`):

1. **Create a composite role** `mfa-required` (Realm roles → Create role).
2. **Attach it** to `TENANT_ADMIN` and `FINANCE` (each role → Action → Add associated roles → `mfa-required`).
3. **Edit the browser flow** (Authentication → Flows → duplicate `browser` → `browser-mfa`):
   - In the `forms` subflow, replace the `Browser - Conditional OTP` subflow's condition
     `Condition - user configured` with **`Condition - user role`**, config `role = mfa-required`.
   - Keep `OTP Form` = **REQUIRED** (this forces OTP setup on first login for users with the role).
4. **Bind** `browser-mfa` as the realm's Browser flow (Action → Bind flow → Browser flow).
5. **Enable step-up `acr`** so the token proves OTP:
   - Realm settings → Sessions/Advanced → set realm attribute **`acr.loa.map`** to e.g. `{"gold":1}`.
   - On the OTP step (or its subflow) set the Level of Authentication (LoA) config so a session that ran OTP
     maps to LoA `1` → `acr = "gold"`.
   - Confirm the `acr` client scope is a default scope on `cos-web` / `cos-backend` (it already is).

## Step 2 — Verify (live)

1. Log in as a `TENANT_ADMIN`/`FINANCE` test user → you must be forced to set up + enter TOTP.
2. Log in as a `SITE_ENGINEER` → **no** OTP prompt (unaffected).
3. Decode the issued access token and read the **`acr`** claim. Record its value for step 3.
4. Confirm a non-privileged token still authenticates end-to-end.

## Step 3 — Activate Layer 2 (backend)

Set on the backend deployment:

- `MFA_REQUIRED_ACR` = the exact `acr` value observed in step 2.3 (comma-separated if more than one). Default `gold`.
- `MFA_ENFORCE=true`.

Before `MFA_ENFORCE=true`, Layer 2 only logs `mfa.shortfall` (WARN) for privileged tokens missing the acr —
watch these logs after step 1 to confirm real traffic carries the expected `acr` before flipping enforcement.

## Step 4 — Export realm back to git

Export the updated realm (`kc.sh export` or Admin Console partial export) and commit it over
`infrastructure/keycloak/realms/construction-os-realm.json` so the config is reproducible.

---

## Rollback

- Backend: `MFA_ENFORCE=false` (kill switch — no redeploy of code needed).
- Keycloak: re-bind the stock `browser` flow.

## Notes

- The custom backend TOTP module (`backend/src/modules/identity/mfa/*`, `/api/v1/auth/mfa/*`) is **deprecated**:
  it is not wired into any client flow (Keycloak-native OTP is the source of truth per master doc). Left in place
  to avoid test churn; remove in a dedicated change.
- Path A (SMS OTP, SITE_WORKER/SITE-ENGINEER) is unaffected — MFA applies to Path B office roles only.
