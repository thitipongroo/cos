---
title: 'Phase 2 — Auth + Tenant System'
version: '0.1.0'
status: Draft
last_updated: '2026-08-22'
authors:
  - thitipongroo
related_docs:
  - README.md
  - ../specifications/05-security-compliance.md
  - ../specifications/06-rbac-permission-matrix.md
  - ../specifications/07-multi-tenant-architecture.md
  - ../../context/00_master_construction_os.md
---

# Phase 2 — Auth + Tenant System

> Compiled from `context/00_master_construction_os.md` § PHASE 2 — AUTHENTICATION + TENANT SYSTEM
> COMMAND and the specification sections cited inline. `docs/specifications/` wins on any conflict;
> see [README § Authority](README.md).

---

## 1. Overview & goals

Establish multi-tenant authentication and the tenant-isolation foundation
(`00_master` § Phase Register, Phase 2 objective). This is the largest and most security-critical
phase — every later phase inherits its identity model, its RBAC vocabulary and its isolation
mechanism.

Done when RLS is enabled on tenant tables, an isolation test proves no cross-tenant read is possible,
and Keycloak-issued JWT authentication is verified end to end (Phase 2 exit).

Effort and position in the graph: `00_master` § Phase Register (**XL**, depends on Phase 1).

---

## 2. Scope

Authoritative list: `00_master` § PHASE 2 COMMAND → `Generate:` and `Constraints:`.

### In scope

Two authentication paths, Keycloak as the single identity source, the RBAC role set and
ABAC attributes, the shared-DB + `tenant_id` + RLS isolation model, the four `platform` tables, the
user-management API, MFA enrolment, and refresh-token rotation.

### Out of scope

- Any domain table or endpoint → Phase 3–7
- Vendor Portal external principals → Phase 5 (`06-rbac-permission-matrix` §6.8b; ADR-030)
- `EnterpriseProvisioningWorkflow` and dedicated-DB automation → Phase 25
  (`07-multi-tenant-architecture` §7.8). Phase 2 delivers only the `dedicated_db_url` column and the
  routing that honours it.
- WAF, pentest, security headers → Phase 16

---

## 3. Architecture

`identity` and `tenant` are **modules inside the NestJS monolith**, not separate deployables — they
are named in the Main Application row of `32-implementation-specifications` §32.2. Keycloak is
external infrastructure (`04-tech-stack` §4.4).

Request path (`04-tech-stack` §4.8; `07-multi-tenant-architecture` §7.1):

```text
Client → Kong Gateway (validates Keycloak JWT, rejects tokens without tenant_id)
       → NestJS KeycloakJwtStrategy.validate()   resolves tenant, checks active, fills req.user
       → JwtAuthGuard.handleRequest()            publishes context into CLS  ← authoritative
       → TenantContextInterceptor                projects onto req.*         ← secondary
       → TenantPrismaService.run()               connects as app_user, SET LOCAL app.current_tenant_id
```

**Why tenant context is resolved in authentication and not in middleware.** NestJS runs middleware
_before_ guards, so a pre-auth middleware cannot read `req.user` (§7.1; ADR-031). A pre-auth
`TenantMiddleware` was originally specified and is retained only as a type holder — it is not
registered.

**Why CLS is authoritative and `req.*` is not.** Under `@nestjs/platform-fastify` the request object
is cloned, so Passport's `req.user` does not survive into downstream guards, interceptors and
providers (§7.1 step 2). Handlers therefore read `req.userId ?? clsUserId()`.

`TenantPrismaService` is a **singleton** that reads CLS in `run()` and caches one `PrismaClient` per
datasource URL; it was originally request-scoped and read `req.user`, which broke under Fastify
(§7.1 step 3; ADR-031).

Guard placement is fixed by `06-rbac-permission-matrix` §6.9 — vocabulary in `@cos/rbac`, concrete
`CanActivate` implementations in `backend/src/shared/guards/`, `JwtAuthGuard` in the identity module.

---

## 4. Data model

Phase 2 creates **four** tables, all in schema `platform`, which is **cross-tenant and carries no
RLS** (`07-multi-tenant-architecture` §7.7 schema registry; `00_master` § PHASE 2 COMMAND → Entities).
`platform.*` always lives on the shared DB and is never replicated to a dedicated DB (§7.1 platform
schema isolation rule).

The authoritative column-level definition is `11-database-schema` §11.1, which defines **eight**
tables in this schema. The four below are Phase 2's; the other four belong to later phases and are
named here so the schema is not read as complete: `tenant_settings` (ADR-028, tenant configuration),
`vendor_identities` and `vendor_trading_relationships` (ADR-030 Vendor Portal, Phase 5), and
`sync_tombstones` (Phase 10 delta sync). `users` additionally carries `photo_url` and `is_active` in
§11.1 — the column list below is the identity-relevant subset, not the full table.

| Table                | Key columns                                                                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenants`            | `tenant_id` PK · `tenant_code` UNIQUE · `keycloak_realm` UNIQUE · `plan_type` ENUM(STARTER, PROFESSIONAL, ENTERPRISE) · `dedicated_db_url` NULL · `data_region` DEFAULT `ap-southeast-1`       |
| `users`              | `user_id` PK · `tenant_id` FK · `keycloak_user_id` UNIQUE · `email` · `display_name` · `mfa_enabled` · `mfa_totp_secret` (encrypted at rest, AES-256-GCM, ADR-035) · INDEX (tenant_id, email)  |
| `tenant_memberships` | `membership_id` PK · `tenant_id` FK · `user_id` FK · `role` ENUM · UNIQUE (tenant_id, user_id)                                                                                                 |
| `audit_logs`         | `log_id` PK · `tenant_id` (denormalised) · `actor_id` · `action` · `resource_type` · `resource_id` · `ip_address` INET · `user_agent` · `metadata` JSONB · INDEX (tenant_id, occurred_at DESC) |

`dedicated_db_url` is `NULL` for shared-DB tenants and non-`NULL` for Enterprise; it is set either at
tenant creation or via `PATCH /api/v1/admin/tenants/{id}/dedicated-db` (§7.1).

**Isolation model for every later phase.** Domain tables — not these — carry
`tenant_id UUID NOT NULL` and exactly one `AS PERMISSIVE` policy named `rls_tenant_isolation`, with
`ENABLE` and `FORCE ROW LEVEL SECURITY` applied together (§7.7):

```sql
CREATE POLICY rls_tenant_isolation ON {schema}.{table}
  AS PERMISSIVE FOR ALL TO app_user
  USING       (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK  (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid);
```

`AS PERMISSIVE`, not `RESTRICTIVE`: a lone RESTRICTIVE policy grants nothing, so the table would deny
every row (§7.7). `NULLIF` makes an unset GUC yield NULL — zero rows — instead of an invalid-UUID
error (ADR-031). The application role `app_user` must never be granted `BYPASSRLS`
(`09-data-architecture` §9.7.3 via `00_master` § PHASE 2 COMMAND).

---

## 5. API contract

OpenAPI is split into two files, one per service, per QM-2: `docs/api/auth.openapi.yaml` and
`docs/api/tenant.openapi.yaml`.

| Group           | Endpoints                                                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Auth (Path A)   | `POST /api/v1/auth/otp/request` · `POST /api/v1/auth/otp/verify` · `POST /api/v1/auth/refresh` · `POST /api/v1/auth/logout`              |
| MFA             | `POST /api/v1/auth/mfa/enroll` · `POST /api/v1/auth/mfa/verify` · `POST /api/v1/auth/mfa/authenticate`                                   |
| Users           | `GET /api/v1/users` · `POST /api/v1/users` · `PATCH /api/v1/users/{userId}/role` · `PATCH /api/v1/users/{userId}/deactivate`             |
| Platform admin  | `GET` + `POST` `/api/v1/admin/tenants` · `PATCH /api/v1/admin/tenants/{id}/dedicated-db` · `PATCH /api/v1/admin/tenants/{id}/deactivate` |
| Tenant settings | `GET /api/v1/tenant/settings` · `PATCH /api/v1/tenant/settings` (ADR-028)                                                                |

User-management endpoints are `TENANT_ADMIN` only, guarded by `JwtAuthGuard` + `RolesGuard`, and live
in the **tenant** module — the tenant module owns user lifecycle (`00_master` § PHASE 2 COMMAND →
User management API). Platform-admin endpoints are `SYSTEM_ADMIN` only
(`06-rbac-permission-matrix` §6.7).

Rate limits that apply here: authentication endpoints 10 req/min per IP, with account lockout after 5
consecutive failures for 15 minutes (QM-7). OTP has its own limits — see § 8.

---

## 6. Events

| Event                            | Emitted from                       |
| -------------------------------- | ---------------------------------- |
| `identity.tenant.created.v1`     | tenant creation                    |
| `identity.tenant.deactivated.v1` | tenant deactivation                |
| `identity.user.created.v1`       | `POST /api/v1/users` (both paths)  |
| `identity.user.role_changed.v1`  | `PATCH /api/v1/users/:userId/role` |

All four conform to the Base Event Envelope (`32-implementation-specifications` §32.4) and are
registered under RecordNameStrategy subjects. Tenant-lifecycle events are emitted with
`tenant_id = "platform"` against the platform pseudo-tenant (`07-multi-tenant-architecture` §7.3
local-development note).

---

## 7. Sequence / flows

**Path A — SMS OTP (SITE_WORKER, SITE_ENGINEER)** (`05-security-compliance` §5.4.2):

```text
1. OTP verification succeeds in the COS identity service
2. KeycloakAdminService.provisionPhoneUser(phone, displayName, realm) — creates the Keycloak user,
   sets an ephemeral one-time credential (temporary: true)
3. POST /realms/{realm}/protocol/openid-connect/token  grant_type=password
   username=phone  password=ephemeralCredential      (directAccessGrantsEnabled required)
4. Keycloak issues an RS256 access token (15 min) + a refresh token; the grant asks for
   scope=offline_access, so that refresh token does not expire (typ=Offline,
   refresh_expires_in=0) and the offline session idles out after 30 days. The ephemeral
   credential is discarded.
5. tenant_id / user_id / role are embedded by the protocol mappers (§5.4.2)
6. Refresh proxies grant_type=refresh_token — Keycloak rotates natively (refreshTokenMaxReuse: 0)
```

OTP send/verify is a **custom lightweight NestJS module inside the identity module — not a Keycloak
extension** — while token issuance always goes through Keycloak Direct Grant
(`00_master` § PHASE 2 COMMAND; QM-4 authentication).

**Step 2 is why an account can hold only one identifier.** The ephemeral credential is written over
the account's password, and Keycloak stores exactly one password credential per user — so on an
account that also had a Path B password, an OTP login destroys it, permanently (the hash cannot be
read back to restore). That is the whole of OQ-14, and the resolution was to stop trying to put both
identifiers on one account rather than to replace step 2.

**`scope=offline_access` is what makes the offline promise true.** Without it the refresh token
carried the realm's 30-minute SSO idle window, not the 7 days this page and `00_master` claimed — so
a worker off-signal for half an hour had to redo SMS OTP on reconnect, which needs the signal they
did not have. Path A only: a non-expiring refresh token belongs on a field handset, not in an office
browser tab. It does not weaken revocation — `enabled: false` blocks an offline refresh, and both
`disableUser` and `eraseUser` set it before logging the session out.

**Path B — email + password (office and management roles)** uses Keycloak OIDC directly; custom
email/password authentication must never be implemented (QM-4). MFA (TOTP) is **required** for
`TENANT_ADMIN` and `FINANCE`.

**Tenant context resolution** is the four-step chain in § 3.

---

## 8. Failure modes & rollback

| Failure                                 | Behaviour                                                                                                  | Source            |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------- |
| OTP guessed repeatedly                  | max 3 attempts per session; 6-digit code, TTL 5 min                                                        | §5.4.2            |
| OTP resend abuse                        | 60-second resend cooldown per phone → HTTP 429 with `retryAfterSeconds`; 10 OTP requests per phone per day | §5.4.2, §14.3     |
| SMS delivery degraded (+66 < 95%)       | Thai SMS fallback provider                                                                                 | §5.4.2            |
| Keycloak user created, COS insert fails | `KeycloakAdminService.deleteUser(userId, realm)` — rollback so no orphan Keycloak identity remains         | §32.8 KD-AUTH-001 |
| `app.current_tenant_id` unset           | `NULLIF(...)` yields NULL → policy matches zero rows; **no error, no leak**                                | §7.7, ADR-031     |
| Token missing `tenant_id` or `role`     | rejected at Kong and again in `KeycloakJwtStrategy.validate()`                                             | §5.4.1            |
| Brute-force on auth endpoints           | 10 req/min per IP; lockout after 5 failures for 15 min                                                     | QM-7              |

**Migration rollback.** Every migration needs a verified rollback script in `prisma/rollbacks/`,
kept outside `prisma/migrations/` so `prisma migrate deploy` does not treat it as a migration and
fail P3015 (QM-9). All 89 are paired as of 2026-08-22, enforced by
`scripts/ci/check-migration-rollbacks.mjs` (§9.7.1, §30.12) — see § 14 OQ-7.

---

## 9. Security

- **JWT custom claims are exactly `tenant_id`, `user_id`, `role`.** No other naming variant
  (`cos_tenant_id`, `tenantId`, `cos_role`) is authoritative. `sub` remains the Keycloak UUID and maps
  to `platform.users.keycloak_user_id` (`05-security-compliance` §5.4.1).
- **Protocol mappers are mandatory on every realm**, shared or dedicated —
  `oidc-usermodel-attribute-mapper` for each of the three claims. Missing mappers cause Kong to reject
  every request (§5.4.2; §7.6 step 3).
- **Realm model:** STARTER / PROFESSIONAL share realm `construction-os`; ENTERPRISE gets
  `cos-{tenantCode}`, provisioned by Phase 25 (`00_master` § PHASE 2 COMMAND → Keycloak Realm Model).
- **Roles** are the nine in `06-rbac-permission-matrix` §6.2 plus the three implementation sub-roles
  in §6.8 (`PROC_MANAGER`, `SITE_WORKER`, `VIEWER`). `SYSTEM_ADMIN` is never provisioned to a tenant
  (§6.7).
- **ABAC** checks `project_membership`, `tenant_match` and `resource_ownership` on every resource
  access, enforced by a `PolicyGuard` separate from `RolesGuard` (`00_master` § PHASE 2 COMMAND →
  Authorization; §6.5).
- **Audit logs are append-only** — no UPDATE or DELETE through the application (QM-4; enforced by
  policy in Phase 16).
- `mfa_totp_secret` is encrypted at rest with application-layer AES-256-GCM (ADR-035).

### MFA enforcement — design vs. verified state

QM-4 and `05-security-compliance` §5.4 require MFA (TOTP) for `TENANT_ADMIN` and `FINANCE`.
**ADR-067 is the decision record for how**, and it enforces in two layers keyed on **role**, not on
login path:

| Layer                   | Mechanism                                                                                                                                      | Verified state                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1 — Keycloak-native OTP | `browser-mfa` (Path B) forces TOTP for the two roles; `direct-grant-mfa` (Path A) **denies** them; `acr.loa.map` proves OTP in the token       | **Present in the realm file and verified live** on 2026-08-22 (ADR-067 Update)        |
| 2 — backend `acr` gate  | `JwtAuthGuard.handleRequest` → `enforceMfaForPrivilegedRoles`; a privileged token whose `acr` is not accepted is rejected `COS-AUTH-001` (403) | Present, still gated by `MFA_ENFORCE` (default `false`) — an ops step, runbook Step 3 |

**The condition is on the `role` user attribute, not on a Keycloak role.** ADR-067 originally
specified `Condition - user role` against a composite realm role `mfa-required`. Measured against a
live realm: **0 of 29 users hold a COS role as a realm role; all 29 carry it as the `role` user
attribute** (spec §5.4.2, `oidc-usermodel-attribute-mapper`). The specified condition would have
fired for nobody. `Condition - user attribute` on `role` reads the same source the JWT claim reads,
so the condition and the token cannot disagree, and provisioning needs no change.

Layer 2 is **method-agnostic by construction**: it reads `acr` off the token and never asks which
path minted it. That is the same shape the industry converged on — Microsoft Entra binds a required
_authentication strength_ to a directory role and evaluates it per sign-in, and Okta expresses the
equivalent through assurance-level policy conditions.

**Keycloak binds Browser flow and Direct Grant flow separately**, so a browser-flow condition does not
run on a Direct Grant token. Path A issues tokens through Direct Grant
(`05-security-compliance` §5.4.2 step 3), which is why it carries its own configuration.

**Path A denies rather than challenges.** Requiring OTP there was tried first and fails twice: the
Path A exchange sends no `otp` parameter, and `direct-grant-validate-otp` against a user with no OTP
credential throws — the token endpoint returned **HTTP 500** rather than refusing. `Deny access`
returns **HTTP 401**. The stock conditional-OTP subflow is left in place below it, so non-privileged
behaviour is unchanged.

**The `acr` map must have two levels.** A password-only token already carries LoA 1, so the
`{"gold":1}` the runbook originally prescribed would label **every** token `acr=gold` — including one
that never ran OTP — and Layer 2's default `MFA_REQUIRED_ACR=gold` would accept it. Measured values:
`{"silver":1,"gold":2}`, non-privileged token `acr=silver`, privileged token after TOTP `acr=gold`.

`KeycloakJwtStrategy` returns `{ ...payload }`, so `acr` reaches `req.user`, and Layer 2 reads the
**authoritative role from `platform.tenant_memberships`** rather than the token claim (ADR-077) — a
stale token cannot dodge the gate with an old role.

**Regression guard:** `scripts/ci/check-keycloak-mfa-config.mjs` asserts, from the realm JSON alone,
that both bindings carry the attribute condition, that Path B requires the OTP form and the LoA
condition, that Path A denies, and that `acr.loa.map` separates a base level from an OTP level. It
runs in the CI lint job (`30-testing-strategy` §30.12). This narrows ADR-067's statement that
"nothing in CI can catch it": nothing in CI can prove the flow _works_ without a Keycloak, but
whether the configuration is _present_ is a property of the file — and presence is what regressed.

**`mfa_totp_secret` and `/api/v1/auth/mfa/*` are deprecated.** ADR-067 and ADR-074 record that the
custom backend TOTP module is not wired into any real login flow; Keycloak owns TOTP, and enrolment
goes through the Keycloak Application-Initiated Action `kc_action=CONFIGURE_TOTP` (ADR-074). The
column and endpoints are retained to avoid test churn, not because they are the mechanism.

---

## 10. Observability

- `active_sessions_total` gauge, labelled by `tenant_id`, emitted by the identity service on JWT
  issue and expiry (`00_master` § PHASE 15 metric list; `31-monitoring-observability` §31.3)
- Every state-changing endpoint writes an immutable audit-log entry carrying actor, action, target
  entity type and id, `tenant_id` and timestamp (QM-4)
- `TenantIsolationBreach` alert fires on `tenant_isolation_check_result == 0` from a synthetic probe
  CronJob every 5 minutes and pages the security lead — severity critical
  (`00_master` § PHASE 15; `30-testing-strategy` §30.6)
- PII never appears in logs, traces or error messages (QM-5)

---

## 11. Testing & acceptance

- Unit: guards, middleware, token validation — 100% lines and branches (QM-1)
- **Integration tests are a Phase 2 deliverable, not deferred to Phase 18** — the full OTP flow on
  Testcontainers (PostgreSQL + Redis), covering `requestOtp → verifyOtp → issueTokens (Direct Grant)
→ refresh → logout` (`00_master` § PHASE 2 COMMAND)
- Isolation: a cross-tenant query must return zero rows (`30-testing-strategy` §30.6)
- Mutation testing is required for permission-check logic, score ≥ 70% (QM-1)

Two recurring unit-test traps in this area are documented in `context.md` QM-1: request-scoped
services read `req.userId` / `req.tenantId` with a CLS fallback, so mocks must set those and not only
`req.user.user_id`; and the `?? ''` fallback in each lazy getter is only covered by **invoking** the
getter on an empty-`REQUEST` instance.

---

## 12. Implementation status

Verified on **2026-08-21** against this working tree (Rule 36).

| Generate item                        | Status     | Evidence                                                                                       |
| ------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------- |
| Identity module                      | ✅ present | `backend/src/modules/identity/` — controller, service, module, `jwt.payload.ts`, `strategies/` |
| Tenant module                        | ✅ present | `backend/src/modules/tenant/` — `tenant.service.ts`, `user.service.ts`, `settings.*`           |
| `KeycloakAdminService` (KD-AUTH-001) | ✅ present | `backend/src/modules/identity/keycloak-admin.service.ts` + spec file                           |
| `KeycloakJwtStrategy`                | ✅ present | `backend/src/modules/identity/strategies/keycloak-jwt.strategy.ts` + spec file                 |
| OTP module (custom, in identity)     | ✅ present | `identity/otp/` — `otp.service.ts`, `sms-sender.ts`, `sms-sender.provider.ts`, `adapters/`     |
| MFA (TOTP)                           | ✅ present | `identity/mfa/mfa.service.ts`; `shared/guards/mfa-enforcement.ts`                              |
| Concrete guards in application layer | ✅ present | `backend/src/shared/guards/` — `roles.guard.ts`, `policy.guard.ts`, `permissions.guard.ts`     |
| `platform` tables                    | ✅ present | `backend/prisma/schema.prisma` — `model Tenant`, `User`, `TenantMembership`, `AuditLog`        |
| RLS policies                         | ✅ present | 26 migrations contain `rls_tenant_isolation`                                                   |
| OpenAPI, two files                   | ✅ present | `docs/api/auth.openapi.yaml`, `docs/api/tenant.openapi.yaml`                                   |
| Migration rollback scripts           | ✅ present | 89 migrations, 89 conforming rollbacks; paired by `scripts/ci/check-migration-rollbacks.mjs`   |

**Beyond the Phase 2 list.** The identity module also contains `consent/`, `data-export/`,
`device-trust/`, `network-origin/`, `privacy-inquiry/`, `privacy-policy/`, `step-up/`,
`subject-request/`, `terms-of-use/` and `last-seen.service.ts`. These are later additions
(the transparency / PDPA surfaces and ADR-081 device trust), not Phase 2 deliverables; their
establishing decisions are not traced in this page.

---

## 13. Dependencies & risks

**Dependencies:** Phase 1. Phase 2 in turn blocks Phase 8 and everything downstream
(`32-implementation-specifications` §32.1).

**Risks:** `R-02` cross-tenant data leak · `R-03` PDPA non-compliance. Scoring, owners and
early-warning metrics are in `00_master` § Risk Register.

---

## 14. Open questions / NOT SPECIFIED

| ID    | Question                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Status                     |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| OQ-7  | **Closed 2026-08-22.** QM-9 and `09-data-architecture` §9.7.1 require a rollback for every migration; five had none and a sixth was misnamed (`_rollback.sql`). All six are now paired — 89/89. The four straightforward ones drop the column or table they added. `20260723000003_notification_delivery_rules` needed the type-recreate route, because PostgreSQL has no `ALTER TYPE … DROP VALUE`: it refuses outright if any row still uses `PUSH` rather than destroying it (§9.7.1 forbids dropping unrecoverable data), and was verified on a live PostgreSQL to reverse the migration exactly, to be idempotent on a second run, and to leave the schema untouched when it refuses. §9.7.1's claim that a CI gate enforces this was false; the gate now exists (`scripts/ci/check-migration-rollbacks.mjs`, §30.12) and pairs by **name** — counting files would not have caught the misnamed one.                                                                                                      | Closed                     |
| OQ-8  | `platform.users` on disk has a `department` column and a `UserAdditionalRole` model, added by migrations `20260730000001` / `20260730000002`. **Neither is in the authoritative schema**: `11-database-schema` §11.1 gives `platform.users` ten columns and `department` is not among them, `tenant_memberships` carries a single `role`, and no additional-roles table exists anywhere in §11.1. The only `department` in the specification set is on the **Employee** entity (§11.2 workforce master) — a different entity. `06-rbac-permission-matrix` and ADR-014 describe one role per membership. No ADR for multiple roles per user was found.                                                                                                                                                                                                                                                                                                                                                          | Open — needs a source      |
| OQ-9  | **Closed 2026-08-21/22.** Unified login: both paths open to every role except `TENANT_ADMIN` and `FINANCE`, which are Path B only. The authoritative statement is now `05-security-compliance` **§5.4.4**; `14` §14.3/§14.5, `20` §20.6/§20.6.1, `00_master` Phase 2 + Phase 10, `context.md` and ADR-017 reference it instead of restating a role binding. **Correction to this entry as first written:** it claimed §5.4 assigned Path A to field roles and Path B to office roles. It did not — §5.4 described both paths purely mechanically, and the binding lived in §14.3, §20.6.1, `00_master` and ADR-017. §5.4.4 is new.                                                                                                                                                                                                                                                                                                                                                                             | Closed                     |
| OQ-12 | `11-database-schema` §11.1 is stale on `platform.users`: it omits **`phone_number`**, which migration `20260610000001` adds (nullable, partial index), and its `keycloak_user_id` note still reads "Path A: phone_number" — the behaviour that same migration removed so the column could hold the real Keycloak UUID per §5.4.1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Open — spec drift          |
| OQ-13 | `14-api-architecture` §14.5's traffic table gives Path A `azp` = **absent**. Measured on a live Keycloak 2026-08-22: a Path A Direct Grant token carries **`azp=cos-backend`** (Path B carries `azp=cos-web`). Kong's behaviour is unaffected — an `azp` matching no registered Consumer falls to the anonymous consumer either way — but the table is wrong, and under unified login it can no longer distinguish the paths by role. Row labels were corrected; the `azp` value was left for a decision.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Open — measured vs spec    |
| OQ-14 | **Closed 2026-08-23 — the premise was wrong, and measuring it changed the answer.** The plan was Keycloak token exchange. It does not exist in a usable form: `TOKEN_EXCHANGE_STANDARD_V2` is enabled but answers `requested_subject is not supported for standard token exchange` (it re-issues a token you already hold; Path A holds none at OTP time), and the legacy `TOKEN_EXCHANGE` that does accept it reports `type: PREVIEW, deprecated: true` in 26.6.4. Saving and restoring the password is impossible too — the admin API withholds `secretData`. **The destruction is real:** a password authenticated, one OTP login ran `resetPassword` + Direct Grant, and the same password was then rejected with `invalid_grant`. **PO decision: one account, one path** — role still does not bind the path, but no account holds both identifiers, so `UserService.create` rejecting both is the design rather than a gap, and the destruction cannot occur. **What made per-account choice look necessary was a different bug:** `00_master` promised "cached token valid 7 days without internet" and the realm delivered `refresh_expires_in = 1800` — THIRTY MINUTES. The 7 days is `ssoSessionMaxLifespan`, a ceiling; `ssoSessionIdleTimeout` is what killed it. A worker off-signal for half an hour came back to a dead refresh token and had to redo SMS OTP, on a site with no signal to receive an SMS on. Proved by compressing the idle window to 60s and waiting 75s: the plain refresh returned `Token is not active`, the `offline_access` one refreshed cleanly. Path A now requests `offline_access` (`refresh_expires_in = 0`, `typ = Offline`, offline idle 30 days) — Path A only, and nothing else had to change: the scope is already optional on `cos-backend` and already a composite of `default-roles-construction-os`. The rotation chain keeps `typ=Offline` over three rotations, so the refresh proxy is untouched. Mobile `OFFLINE_SESSION_TTL_MS` moved 7 → 30 days to match. Revocation verified: admin `logout` alone does NOT revoke an offline session, but `enabled: false` does, and `disableUser`/`eraseUser` both set it first. Four guarantees falsified against broken variants. | Closed 2026-08-23 |
| OQ-15 | **Closed 2026-08-23 — measured against the live schema.** §11.4's "every record has `created_by` / `deleted_at`, all records soft-delete" is false by a wide margin: of 271 tables, 22 carry `created_by` and 6 carry `deleted_at`. The rule was never built, and asserting it universally contradicted §11.1's platform tables and QM-4's append-only audit log — which must not be soft-deletable at all. §11.4 now states soft delete as opt-in per table, names the six and why each opts in, and names the two categories that must never: append-only audit records, and rows whose deletion IS the business fact, where a flag left behind grants access to any reader who forgets to filter. | Closed 2026-08-23 |
| OQ-17 | **Closed 2026-08-22 — risk accepted.** The entry was first CORRECTED: QM-7's account lockout is implemented, for Path B. The original claim that it was absent from every authentication path came from a search of `backend/src`, which is not where Path B authenticates — `infrastructure/keycloak/realms/construction-os-realm.json` carries `bruteForceProtected: true`, `failureFactor: 5`, `maxFailureWaitSeconds: 900`, `permanentLockout: false`. Path A is genuinely not covered, and structurally so: `OtpService.verifyOtp` compares against Redis and throws locally, and `KeycloakAdminService` is called only after a verification succeeds, so no Keycloak failure counter ever sees a wrong OTP. The product owner has accepted that rather than adding a lock — guessing is bounded at 3 attempts per code × 10 codes per day = 30/day/number against a 10⁶ space, each attempt needing a fresh code the attacker cannot read; a per-account lock would let anyone with a worker's phone number strand the only login a `SITE_WORKER` has; and it does nothing about SIM swap or SS7 interception, which are why SMS is a restricted authenticator at all. The acceptance is bounded to the current limits and recorded in `docs/security/sms-otp-restricted-authenticator.md` §3.3. | Closed 2026-08-22  |
| OQ-48 | **Closed 2026-08-23 — erasure now reaches the account and the identity provider.** `platform.users` is anonymised (`display_name`, `email`, `phone_number`) and deactivated in the same statement — those columns are how the person signs in, so clearing them ends the account by definition. The row survives because it anchors the audit trail. The Keycloak account is disabled, logged out and scrubbed; the realm had to set `editUsernameAllowed: true` first, because the username is the subject's own email or phone and was read-only. A failure there is reported, never rolled back. Erasure also gained a per-entity `PII_ERASED` audit row, written from the ids the UPDATEs return. See `11-database-schema` §11.4. | Closed 2026-08-23 |
| OQ-10 | **Closed 2026-08-23 — the two code-side halves are fixed.** Layer 1 has been in the realm since 2026-08-22 (`browserFlow: browser-mfa`, `directGrantFlow: direct-grant-mfa`, `acr.loa.map`, guarded by `check-keycloak-mfa-config.mjs`), but two things in the repository still said otherwise or got in the way. `MFA_ENFORCE` / `MFA_REQUIRED_ACR` lived only in `.env.example` and in **no Helm values file**, so the kill switch the runbook tells ops to throw could not be thrown in a cluster without a chart edit first; both are now in all four `cos-backend` values files at their safe defaults. And the header of `mfa-enforcement.ts` still asserted Layer 1 was "NOT PRESENT IN THE CHECKED-IN REALM" and that Layer 2 was "the only depth there is" — a security control's own source file is the worst place to be wrong about whether the other layer exists. Applying the realm to an already-running Keycloak and setting `MFA_ENFORCE=true` remain ops steps in the runbook. | Closed 2026-08-23 |
| OQ-11 | **Closed 2026-08-23 — the original scenario shrank, and a worse one behind it is fixed.** Under one-account-one-path (OQ-14) a Path B account has `phone_number = NULL` and `issueTokensForPhone` matches on that column, so a privileged user can no longer reach the OTP path at all. Promotion still could: `changeRole` had **no guard**, so a phone-only SITE_ENGINEER promoted to TENANT_ADMIN was refused on Path A by Keycloak and had no email for Path B — locked out of both, silently, with `sendPasswordResetLink` unable to help because it needs an email too. `changeRole` now refuses that promotion before any write. The error mapping is fixed with it: `invalid_grant` from a declined grant becomes 401 `COS-AUTH-001` pointing at email sign-in, instead of `COS-AUTH-503 Identity provider unavailable` — a refusal is not an outage. The message does not say WHY the grant was declined, because `invalid_grant` also means "wrong credential" and separating them would let a caller enumerate privileged accounts by phone number. The pre-send check this row originally proposed was deliberately NOT built, for the same reason: `requestOtp` touches no database today. | Closed 2026-08-23 |
| OQ-51 | **Closed 2026-08-23.** Validation resolves the issuer per tenant against a trusted-issuer allowlist read from `platform.tenants.keycloak_realm`, and `validate()` rejects a token whose `iss` realm is not the realm registered for the tenant it claims. Dedicated ENTERPRISE realms now work end to end, and the `tenant_id` claim is no longer believed on its own. | Closed 2026-08-23 |

Recorded, not resolved — per [README § Open questions](README.md#open-questions-register).
