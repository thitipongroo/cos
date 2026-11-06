# Runbook — MFA Enforcement for TENANT_ADMIN / FINANCE (spec §5.4.1)

MFA (TOTP) is **required** for the `TENANT_ADMIN` and `FINANCE` roles (QM-4; spec §5.4.1; master
Phase 2). ADR-067 enforces it in two layers, both keyed on **role** (Layer 1 through an attribute
derived from it) — not on which login path was used:

- **Layer 1 — Keycloak (authoritative):** the login flow forces OTP for these roles on Path B, and
  refuses them outright on Path A. Since ADR-110 round 5 it reads the user attribute `mfa_required`, which the backend
  sets when the role is held as the primary **or an additional** role — not the `role` attribute, which carries the
  primary role only (§ Step 4).
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

| Execution                             | Requirement | Config                                           |
| ------------------------------------- | ----------- | ------------------------------------------------ |
| `Condition - user attribute`          | REQUIRED    | `mfa_required` matches `^true$`, regex on        |
| `Condition - Level of Authentication` | REQUIRED    | `loa-condition-level = 2`                        |
| `OTP Form`                            | REQUIRED    | forces TOTP setup on first login for those roles |

## Step 1b — Direct Grant flow (Path A): refuse privileged roles

`TENANT_ADMIN` and `FINANCE` are **Path B only** (product-owner decision 2026-08-21). Applied as flow
`direct-grant-mfa`, bound as the realm Direct Grant flow, with a CONDITIONAL subflow
`Path B only - privileged roles` placed **before** the stock conditional-OTP subflow:

| Execution                    | Requirement | Config                                                                 |
| ---------------------------- | ----------- | ---------------------------------------------------------------------- |
| `Condition - user attribute` | REQUIRED    | same `mfa_required` match as above                                     |
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

## Step 2 — Verify (live)

**Most of this IS scriptable, and now is:**

```bash
KEYCLOAK_URL=https://<keycloak> KEYCLOAK_ADMIN_USER=admin KEYCLOAK_ADMIN_PASSWORD=… \
KEYCLOAK_CLIENT_SECRET=… \
node scripts/ops/verify-keycloak-mfa-live.mjs --realm <realm> --probe
```

It reads the RUNNING realm — not the committed file, which is what
`scripts/ci/check-keycloak-mfa-config.mjs` does — and asserts the flow bindings, the
`acr.loa.map` shape, the `Deny access` execution and its ordering ahead of the conditional-OTP
subflow, and the privileged-role match. With `--probe` it creates a throwaway `TENANT_ADMIN` and a
throwaway `SITE_ENGINEER`, attempts a Direct Grant as each, and deletes them — reproducing cases 3
and 4 below. That probe is the only part that proves the flow **runs** rather than merely existing:
falsified by unbinding `directGrantFlow`, at which point the static check reports the wrong binding
**and** the probe reports that a TENANT_ADMIN was issued a token.

It refuses to create probe users in a realm whose name does not look non-production unless `--force`
is passed.

**What still needs a browser** — cases 1, 2, 5 and 6 below: forced TOTP enrolment, the absence of an
OTP prompt for a non-privileged user, and reading `acr` out of an issued Path B token. The script
says so in its own output rather than implying full coverage.

### The original manual list

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
2. Re-run Step 2 against that environment. Do not assume it inherited anything — and now you do not
   have to trust a checklist for it:

   ```bash
   node scripts/ops/verify-keycloak-mfa-live.mjs --realm <realm> --probe
   ```

   Exit 0 means the running realm has Layer 1; exit 1 lists what is missing. Run it BEFORE Step 3 —
   enabling `MFA_ENFORCE` against a realm that does not emit `acr` locks out every privileged user.

3. Only then Step 3.

---

## Step 4 — Switch an existing environment to `mfa_required` (ADR-110 rounds 5–6)

Until round 5 both conditions matched `role` against `^(TENANT_ADMIN|FINANCE)$`. A person holding either role as an
ADDITIONAL role was never asked for OTP, so never received an `acr=gold` token. The conditions now match
`mfa_required` = `true`; `UserService` writes it on every role change — in the same Keycloak update as `role`, from
the roles stored after the change — and `createEmailUser` on creation.

**Who gets it** (`mfaRequiredFor`, D18): an account whose PRIMARY role is TENANT_ADMIN / FINANCE, or which has an email
and holds one as an ADDITIONAL role. A phone-only account whose privileged role is only an additional one does not:
the attribute would get it refused on Direct Grant, its only way in, and it would lose all access rather than that
role. It still cannot use the role once `s1.identity.additional-role-mfa` is on.

**Order matters. Backfill BEFORE the realm change.** An account created before round 5 has no `mfa_required`; once
the realm reads it, such a TENANT_ADMIN is no longer asked for OTP or refused on Direct Grant (measured: Direct Grant
HTTP 200). Layer 2 still refuses its non-gold token when `MFA_ENFORCE=true`, but Layer 1 would be open. Setting the
attribute early is harmless: the old conditions ignore it.

1. Run `scripts/readiness/check-path-b-roles.sh` (`docs/runbooks/tenant-admin-flags-rollout.md`) and settle each
   account it lists with its tenant: those are the phone-only holders above.
2. Deploy the backend with rounds 5–6, so role changes from now on keep `mfa_required` current.
3. Backfill, dry run first. It lists user ids and realms only:

   ```bash
   DATABASE_URL=… KEYCLOAK_URL=… KEYCLOAK_ADMIN_CLIENT_SECRET=… \
     pnpm --filter @cos/backend exec ts-node prisma/backfill-mfa-required.ts          # dry run
   … pnpm --filter @cos/backend exec ts-node prisma/backfill-mfa-required.ts --apply  # writes
   ```

   It selects active users of active tenants holding TENANT_ADMIN or FINANCE as a primary or additional role, skips
   the phone-only holders above (it prints how many), and sets the attribute on the rest. It is idempotent and never
   removes the attribute. Exit 1 = some accounts failed (it prints which; re-run); exit 2 = the run crashed. It skips
   inactive users and tenants: if one is ever reactivated by hand, run it again.

   If the round-5 version of this script was already run with `--apply` in the environment, it gave `mfa_required` to
   the phone-only holders too, and nothing removes it — such an account stays refused on Direct Grant. Find them with
   `check-path-b-roles.sh` and save their roles once (any `PUT /users/{id}/roles`): the round-6 sync writes `false`.

4. Change the two `Condition - user attribute` configs (`privileged-role-attr` and
   `mfa-privileged-role-auth-otp-form`) to `attribute_name = mfa_required`, `attribute_expected_value = ^true$`.
   Edit the existing conditions; do **not** add a second conditional subflow beside them. Two
   `Condition - Level of Authentication` at the same level make Keycloak 26.6.4 fail every login in the realm with
   `IllegalStateException: Duplicate key 2` (measured while building round 5).
5. Verify: `node scripts/ops/verify-keycloak-mfa-live.mjs --realm <realm> --probe`. It checks both subflows (the
   condition must hold for `mfa_required` = `true` the way Keycloak evaluates it, with no other condition beside
   it except the browser subflow's Level of Authentication, and no CONDITIONAL or DISABLED subflow above it) and
   probes a user carrying `role=SITE_ENGINEER` + `mfa_required`, which must get HTTP 401. Then cases 1–6 of Step 2,
   plus a browser login of a user who holds FINANCE as an additional role only: they must
   be asked for OTP and receive `acr=gold`.
6. Only then consider `s1.identity.additional-role-mfa` (`docs/runbooks/tenant-admin-flags-rollout.md`).

Measured locally on 2026-11-03 (Keycloak 26.6.4, this repository's realm file):

| Case                                                             | Result                                                                                   |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Additional FINANCE / TENANT_ADMIN, `mfa_required` — Direct Grant | HTTP 401                                                                                 |
| Primary TENANT_ADMIN, `mfa_required` — Direct Grant              | HTTP 401                                                                                 |
| SITE_ENGINEER — Direct Grant                                     | HTTP 200                                                                                 |
| Primary TENANT_ADMIN **without** the attribute — Direct Grant    | HTTP 200 (why the backfill goes first)                                                   |
| Additional privileged role — browser                             | asked for OTP, token `acr=gold`                                                          |
| Primary TENANT_ADMIN — browser                                   | asked for OTP, token `acr=gold`                                                          |
| SITE_ENGINEER — browser                                          | no OTP, token `acr=silver`                                                               |
| Backfill against a migrated database, 5 seeded accounts          | the 2 eligible set, other attributes kept; 3 untouched; second `--apply` changes nothing |
| Backfill (round 6), 7 accounts incl. 2 phone-only                | 3 set; phone-only + additional FINANCE skipped (Direct Grant still 200); 3 untouched     |
| Role change through `syncRoleAttributes`                         | one update; `enabled=false` and `requiredActions` set earlier kept; Direct Grant 401     |

The backfill run also found that Keycloak 26 refuses a user update whose body carries `attributes` without the root
fields (HTTP 400 "User name is missing"). The old `syncUserRole` had sent exactly that, so on 26.6.4 every role change
was committed in the database and then answered 500 with Keycloak's `role` unchanged. Updates now send `username`,
`email`, `firstName`, `lastName` and `attributes` — not the whole representation, whose `enabled` and
`requiredActions` would undo a deactivation or a required action set between the read and the write.

## Rollback

- Backend: `MFA_ENFORCE=false` (kill switch — no code redeploy).
- Keycloak: re-bind the stock `browser` and `direct grant` flows. Both remain in the realm untouched.

## Notes

- The custom backend TOTP module (`backend/src/modules/identity/mfa/*`, `/api/v1/auth/mfa/*`) is
  **deprecated**: it is wired into no client flow, and Keycloak-native OTP is the source of truth
  (QM-4). Enrolment goes through the Keycloak Application-Initiated Action
  `kc_action=CONFIGURE_TOTP` (ADR-074).
- **Path A for non-privileged roles is unaffected** — no OTP step is added on either binding for a
  user without `mfa_required = true`.
- **The realm in git is `construction-os-dev`.** Spec §7.6 names the shared realm `construction-os`
  and gives ENTERPRISE tenants `cos-{tenantCode}`. Apply these steps to every realm that serves
  privileged users.
- **NIST SP 800-63B Rev 4** classifies SMS/PSTN OTP as a _restricted authenticator_ that no longer
  satisfies AAL2 — an independent reason privileged roles do not authenticate by SMS. It carries its
  own obligations (documented risk assessment, migration roadmap, user notification) for the Path A
  population; tracked separately.
