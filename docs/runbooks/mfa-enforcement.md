# Runbook — MFA Enforcement for TENANT_ADMIN / FINANCE (spec §5.4.1)

MFA (TOTP) is **required** for the `TENANT_ADMIN` and `FINANCE` roles (QM-4; spec §5.4.1; master
Phase 2). ADR-067 enforces it in two layers, both keyed on **role** — not on which login path was
used:

- **Layer 1 — Keycloak (authoritative):** the login flow forces OTP for these roles on Path B, and
  refuses them outright on Path A.
- **Layer 2 — backend (defence-in-depth):** `JwtAuthGuard` calls `enforceMfaForPrivilegedRoles`
  (`backend/src/shared/guards/mfa-enforcement.ts`), which rejects a privileged token whose `acr`
  claim does not prove OTP. Gated by `MFA_ENFORCE` (**default off**).

---

## Status

| Layer                                     | State                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Layer 1 — in `construction-os-realm.json` | **Present and verified** against a live Keycloak 26.6.4 on 2026-08-22 (see § What was measured) |
| Layer 1 — in an already-running Keycloak  | **Not applied.** Import runs on first init only — see § Applying to an existing environment     |
| Layer 2 — `MFA_ENFORCE`                   | **Off** (default `false`). Ops enables it per Step 3                                            |

Guard against regression:

```bash
node scripts/ci/check-keycloak-mfa-config.mjs
```

It runs in the CI lint job and asserts the realm file still carries Layer 1. It checks **presence**,
not behaviour — no script can execute an authentication flow without a server.

---

## The mechanism is NOT the one ADR-067 specifies, and that is deliberate

ADR-067 keys the condition on a composite realm role `mfa-required` attached to `TENANT_ADMIN` and
`FINANCE`, evaluated by `Condition - user role`. Measured against the live realm on 2026-08-22:

| Measured                                     | Value                                                    |
| -------------------------------------------- | -------------------------------------------------------- |
| Users in the realm                           | 29                                                       |
| Users holding a COS role as a **realm role** | **0**                                                    |
| Users holding it as the `role` **attribute** | **29**                                                   |
| `role` claim source                          | `oidc-usermodel-attribute-mapper`, `user.attribute=role` |

`Condition - user role` reads role mappings. Because no user holds `TENANT_ADMIN` as a Keycloak realm
role, that construction **fires for nobody** — it would have enforced nothing even if it had been
applied as the ADR claims. COS stores the role as a user attribute by design (spec §5.4.2).

The working mechanism is **`Condition - user attribute`** on `role` with
`attribute_expected_value = ^(TENANT_ADMIN|FINANCE)$` and `regex = true`. It reads the same source the
JWT claim reads, so the condition and the token can never disagree, and it needs no change to user
provisioning. ADR-067 carries a matching Update entry dated 2026-08-22.

---

## Step 1a — Browser flow (Path B): force OTP for the two roles

Applied as flow `browser-mfa`, bound as the realm Browser flow. Inside its
`Browser - Conditional OTP` subflow:

| Execution                             | Requirement | Config                                               |
| ------------------------------------- | ----------- | ---------------------------------------------------- |
| `Condition - user attribute`          | REQUIRED    | `role` matches `^(TENANT_ADMIN\|FINANCE)$`, regex on |
| `Condition - Level of Authentication` | REQUIRED    | `loa-condition-level = 2`                            |
| `OTP Form`                            | REQUIRED    | forces TOTP setup on first login for those roles     |

## Step 1b — Direct Grant flow (Path A): refuse privileged roles

`TENANT_ADMIN` and `FINANCE` are **Path B only** (product-owner decision 2026-08-21). Applied as flow
`direct-grant-mfa`, bound as the realm Direct Grant flow, with a CONDITIONAL subflow
`Path B only - privileged roles` placed **before** the stock conditional-OTP subflow:

| Execution                    | Requirement | Config                                                                 |
| ---------------------------- | ----------- | ---------------------------------------------------------------------- |
| `Condition - user attribute` | REQUIRED    | same privileged-role match as above                                    |
| `Deny access`                | REQUIRED    | `denyErrorMessage` = "This role must sign in with email and password." |

**Deny, not challenge.** Demanding OTP here was tried first and is wrong twice over: the Path A
exchange sends no `otp` parameter (spec §5.4.2 step 3), so it can never be satisfied, and
`direct-grant-validate-otp` against a user with no OTP credential throws
`AuthenticationFlowException` — the token endpoint returned **HTTP 500** with an empty body rather
than refusing cleanly. With `Deny access` the same request returns **HTTP 401**.

The stock `Direct Grant - Conditional OTP` subflow is left untouched below it, so behaviour for every
non-privileged user is unchanged.

## Step 1c — Step-up `acr` so the token proves OTP

Realm attribute **`acr.loa.map` = `{"silver":1,"gold":2}`**, with the `acr` client scope in
`defaultDefaultClientScopes` (already true).

> **Do not use `{"gold":1}`.** That is what this runbook said before 2026-08-22 and it produces a gate
> that accepts everything. Measured: a password-only Direct Grant token already carries LoA 1, so a
> single-level map labels **every** token `acr=gold` — including one that never ran OTP — and Layer 2's
> default `MFA_REQUIRED_ACR=gold` then passes it. The map needs a base level and a higher OTP level,
> and the OTP subflow needs the `Condition - Level of Authentication` at the higher level (Step 1a).

## Step 2 — Verify (live — the part no script can do)

### What was measured on 2026-08-22

Keycloak 26.6.4, realm `construction-os-dev`, throwaway users carrying only the `role` attribute:

| Case                                    | Result                                                   |
| --------------------------------------- | -------------------------------------------------------- |
| `SITE_ENGINEER` — Direct Grant (Path A) | HTTP 200, token issued, `acr=silver`                     |
| `TENANT_ADMIN` — Direct Grant (Path A)  | **HTTP 401**, no token                                   |
| `SITE_ENGINEER` — browser (Path B)      | authorization code issued, **no OTP challenge**          |
| `TENANT_ADMIN` — browser (Path B)       | redirected to `required-action?execution=CONFIGURE_TOTP` |
| `TENANT_ADMIN` — after completing TOTP  | token issued with **`acr=gold`**, `role=TENANT_ADMIN`    |

The exported realm was then re-imported into a **clean** Keycloak container and the Path A cases
re-run against it: `SITE_ENGINEER` 200, `TENANT_ADMIN` 401. That is what proves the committed file is
importable — the failure mode this runbook has always warned about is a malformed flow breaking every
login in the realm.

### Re-run these after any change

1. Browser login as `TENANT_ADMIN` / `FINANCE` → forced to set up and enter TOTP.
2. Browser login as `SITE_ENGINEER` → no OTP prompt.
3. Path A (`/api/v1/auth/otp/request` → `verify`) as `TENANT_ADMIN` → the Direct Grant exchange fails
   with 401; no access token is issued.
4. Path A as `SITE_ENGINEER` → succeeds unchanged.
5. Decode a privileged Path B token → `acr` must be the **higher** level's name (`gold`).
6. Decode a non-privileged token → `acr` must be the base level (`silver`), never `gold`.

## Step 3 — Activate Layer 2 (backend)

- `MFA_REQUIRED_ACR=gold` — the check script prints the value implied by the realm's `acr.loa.map`.
- `MFA_ENFORCE=true`.

Before flipping `MFA_ENFORCE`, Layer 2 only logs `mfa.shortfall` (WARN) for privileged tokens missing
the `acr`. Watch those logs and confirm real traffic carries `acr=gold` first.

> Layer 2 keys off the **authoritative role from `platform.tenant_memberships`**, not the token's
> `role` claim — `KeycloakJwtStrategy` overwrites the claim with the database row (ADR-077). A stale
> token cannot dodge the gate by carrying an old role. `acr` reaches the guard because the strategy
> returns `{ ...payload }`.

## Applying to an existing environment

`--import-realm` runs **only on first initialisation**. A Keycloak that already has this realm will
not pick up the committed file. For those:

1. Admin Console → Authentication → recreate `browser-mfa` and `direct-grant-mfa` per Steps 1a/1b,
   set `acr.loa.map` per Step 1c, and bind both flows; **or** drive the Admin REST API, which is how
   the verified configuration above was built.
2. Re-run Step 2 against that environment. Do not assume it inherited anything.
3. Only then Step 3.

---

## Rollback

- Backend: `MFA_ENFORCE=false` (kill switch — no code redeploy).
- Keycloak: re-bind the stock `browser` and `direct grant` flows. Both remain in the realm untouched.

## Notes

- The custom backend TOTP module (`backend/src/modules/identity/mfa/*`, `/api/v1/auth/mfa/*`) is
  **deprecated**: it is wired into no client flow, and Keycloak-native OTP is the source of truth
  (QM-4). Enrolment goes through the Keycloak Application-Initiated Action
  `kc_action=CONFIGURE_TOTP` (ADR-074).
- **Path A for non-privileged roles is unaffected** — no OTP step is added on either binding for a
  user whose `role` attribute is not one of the two.
- **The realm in git is `construction-os-dev`.** Spec §7.6 names the shared realm `construction-os`
  and gives ENTERPRISE tenants `cos-{tenantCode}`. Apply these steps to every realm that serves
  privileged users.
- **NIST SP 800-63B Rev 4** classifies SMS/PSTN OTP as a _restricted authenticator_ that no longer
  satisfies AAL2 — an independent reason privileged roles do not authenticate by SMS. It carries its
  own obligations (documented risk assessment, migration roadmap, user notification) for the Path A
  population; tracked separately.
