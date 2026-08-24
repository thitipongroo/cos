# Runbook — MFA Enforcement for TENANT_ADMIN / FINANCE (spec §5.4.1)

MFA (TOTP) is **required** for the `TENANT_ADMIN` and `FINANCE` roles (QM-4; spec §5.4.1; master
Phase 2). ADR-067 enforces it in two layers, both keyed on **role** — not on which login path was
used:

- **Layer 1 — Keycloak (authoritative):** the login flow forces OTP for these roles, so a user in
  one of them cannot complete login without configuring and entering a TOTP code.
- **Layer 2 — backend (defence-in-depth):** `JwtAuthGuard` calls `enforceMfaForPrivilegedRoles`
  (`backend/src/shared/guards/mfa-enforcement.ts`), which rejects a privileged token whose `acr`
  claim does not prove OTP. Gated by `MFA_ENFORCE` (**default off**) so it ships before Layer 1 is
  verified — enforcing against a realm that does not yet emit the expected `acr` would lock out every
  privileged user.

> **Layer 1 covers TWO flow bindings, not one.** Keycloak binds the **Browser** flow and the
> **Direct Grant** flow separately, and a browser-flow condition does not run on a Direct Grant
> token. Path B logs in through the browser flow; Path A obtains its token through **Direct Grant**
> (`grant_type=password`, spec §5.4.2 step 3). Configuring only the browser flow leaves the
> Direct Grant path unguarded — Step 1b exists for that reason.

---

## Current state — verified, not assumed

Run the static check before and after any change:

```bash
node scripts/ci/check-keycloak-mfa-config.mjs
```

As of 2026-08-21 it reports **6 findings** against
`infrastructure/keycloak/realms/construction-os-realm.json`: no `mfa-required` role, no
`acr.loa.map`, and both the browser and direct-grant bindings still pointing at the stock `builtIn`
flows with `conditional-user-configured`. `MFA_ENFORCE` also defaults to `false`.

**Neither layer is active in any environment provisioned from this repository.** That is the state
this runbook exists to change.

> `conditional-user-configured` is precisely the condition ADR-067's security review rejected: it
> runs OTP only for users who have **already enrolled**, so a privileged user who never enrolled
> signs in with a password alone.

### Why Layer 1 is not a hand-edit of the realm JSON

Every one of the realm's 18 authentication flows is `builtIn: true`, so the flows this runbook needs
do not exist yet and would have to be authored by hand — and **this repository has no running
Keycloak to validate an import against.** A malformed authentication-flow import breaks **all**
logins in the realm. So Layer 1 is applied and verified against a live Keycloak using the steps
below, then the corrected realm is exported back to git.

> An earlier version of this note justified the rule by claiming the realm file "has no
> `authenticatorConfig` array or realm-level `attributes` block". Both are present — two
> `authenticatorConfig` entries and eight `attributes` keys. The rule stands on the reasons above;
> the incorrect ones are removed rather than left to be cited.

### Which realm

The file in git declares `"realm": "construction-os-dev"` and `docker-compose.yml` mounts it as
`construction-os-dev-realm.json`. Spec §7.6 names the shared realm for STARTER / PROFESSIONAL
tenants `construction-os`, and ENTERPRISE tenants get `cos-{tenantCode}`. **Apply these steps to
every realm that serves privileged users**, and treat the checked-in file as the dev realm it says
it is.

---

## Step 1a — Browser flow: force OTP for the two roles (Path B)

In the Keycloak Admin Console for the target realm:

1. **Create a composite role** `mfa-required` (Realm roles → Create role).
2. **Attach it** to `TENANT_ADMIN` and `FINANCE` (each role → Action → Add associated roles →
   `mfa-required`). Without this the condition never fires for anyone.
3. **Duplicate the browser flow** (Authentication → Flows → `browser` → Duplicate → `browser-mfa`).
   - In the `forms` subflow, replace the `Browser - Conditional OTP` subflow's condition
     `Condition - user configured` with **`Condition - user role`**, config `role = mfa-required`.
   - Keep `OTP Form` = **REQUIRED** — this forces OTP setup on first login for users with the role.
4. **Bind** `browser-mfa` as the realm's Browser flow (Action → Bind flow → Browser flow).

## Step 1b — Direct Grant flow: refuse privileged tokens on Path A

Path A (phone + SMS OTP) mints its token through Direct Grant. `TENANT_ADMIN` and `FINANCE` are
**Path B only** (product-owner decision 2026-08-21), and this step is what makes that true at the
identity provider rather than only in policy.

1. **Duplicate the direct grant flow** (`direct grant` → Duplicate → `direct-grant-mfa`).
   - In the `Direct Grant - Conditional OTP` subflow, replace `Condition - user configured` with
     **`Condition - user role`**, config `role = mfa-required`.
   - Keep `OTP` (`direct-grant-validate-otp`) = **REQUIRED**.
2. **Bind** `direct-grant-mfa` as the realm's Direct Grant flow.

**Effect.** `direct-grant-validate-otp` requires an `otp` form parameter on the token request. The
COS Path A exchange sends only `grant_type=password`, `username=<phone>`,
`password=<ephemeralCredential>` (spec §5.4.2 step 3) — no `otp` — so a privileged user's Path A
attempt now **fails at Keycloak** instead of yielding a token with no second factor.

> **What changes and what does not.** Under the stock `conditional-user-configured`, a privileged
> user who has **already enrolled** TOTP would already fail Path A today. Step 1b closes the case
> that matters: the privileged user who has **never enrolled**, who currently gets a token.
>
> **Companion change (proposed, not yet built).** Keycloak's refusal surfaces to the user as an
> opaque token-endpoint failure. `OtpService` should decline to send an OTP to a phone whose account
> holds `TENANT_ADMIN` or `FINANCE` and return `COS-AUTH-001` with a "use email sign-in" message, so
> the dead end is explained where the user is. This changes real login behaviour and is therefore
> raised here rather than applied — see `docs/technical-design/phase-02-auth-tenant-system.md` § 14.

## Step 1c — Step-up `acr` so the token proves OTP

Applies to both bindings; without it Layer 2 has nothing to read.

1. Realm settings → set realm attribute **`acr.loa.map`** to e.g. `{"gold":1}`.
2. On the OTP step (or its subflow) in **both** flows, set the Level of Authentication (LoA) config
   so a session that ran OTP maps to LoA `1` → `acr = "gold"`.
3. Confirm the `acr` client scope is a default scope — verified present in
   `defaultDefaultClientScopes`, and the check script asserts it.

## Step 2 — Verify (live — this is the part no script can do)

1. Log in as a `TENANT_ADMIN` / `FINANCE` test user through the browser → you must be forced to set
   up and enter TOTP.
2. Log in as a `SITE_ENGINEER` through the browser → **no** OTP prompt.
3. Attempt Path A (`POST /api/v1/auth/otp/request` → `verify`) as a `TENANT_ADMIN` → the Direct Grant
   exchange must fail; confirm no access token is issued.
4. Attempt Path A as a `SITE_ENGINEER` → succeeds unchanged.
5. Decode the issued Path B access token and read the **`acr`** claim. Record its value for Step 3.
6. Confirm a non-privileged token still authenticates end-to-end against the API.

## Step 3 — Activate Layer 2 (backend)

Set on the backend deployment:

- `MFA_REQUIRED_ACR` = the exact `acr` value observed in Step 2.5 (comma-separated if more than one).
  Default `gold`; the check script prints the value implied by `acr.loa.map`.
- `MFA_ENFORCE=true`.

Before flipping `MFA_ENFORCE`, Layer 2 only logs `mfa.shortfall` (WARN) for privileged tokens missing
the `acr`. Watch those logs after Step 1 and confirm real traffic carries the expected `acr` first.

> Layer 2 keys off the **authoritative role from `platform.tenant_memberships`**, not the token's
> `role` claim — `KeycloakJwtStrategy` overwrites the claim with the database row (ADR-077). A stale
> token cannot dodge the gate by carrying an old role.

## Step 4 — Export the realm back to git

Export the updated realm (`kc.sh export` or Admin Console partial export) and commit it over
`infrastructure/keycloak/realms/construction-os-realm.json`.

## Step 5 — Close the loop so this cannot silently regress

1. Re-run `node scripts/ci/check-keycloak-mfa-config.mjs` — it must exit 0.
2. **Wire it into the CI lint job in the same PR as the corrected realm** (`.github/workflows/ci.yml`,
   alongside `check-legal-parity.mjs`) and add the row to `30-testing-strategy` §30.12.
   It is deliberately not wired yet: the realm is non-compliant today, so adding the gate first would
   block every PR.
3. Update the ADR-067 status note — it currently records the verified gap.

---

## Rollback

- Backend: `MFA_ENFORCE=false` (kill switch — no code redeploy).
- Keycloak: re-bind the stock `browser` and `direct grant` flows.

## Notes

- The custom backend TOTP module (`backend/src/modules/identity/mfa/*`, `/api/v1/auth/mfa/*`) is
  **deprecated**: it is wired into no client flow, and Keycloak-native OTP is the source of truth
  (QM-4). Enrolment goes through the Keycloak Application-Initiated Action
  `kc_action=CONFIGURE_TOTP` (ADR-074). Left in place to avoid test churn; remove in a dedicated
  change.
- **Path A for non-privileged roles is unaffected.** `SITE_WORKER` / `SITE_ENGINEER` and every other
  role without `mfa-required` see no OTP step on either binding.
- **NIST SP 800-63B Rev 4** classifies SMS/PSTN OTP as a _restricted authenticator_ that no longer
  satisfies AAL2. That is an independent reason privileged roles do not authenticate by SMS alone,
  and it carries its own obligations (documented risk assessment, migration roadmap, user
  notification) for the Path A population — tracked separately.
