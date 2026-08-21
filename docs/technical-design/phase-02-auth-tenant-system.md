---
title: 'Phase 2 — Auth + Tenant System'
version: '0.1.0'
status: Draft
last_updated: '2026-08-21'
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

Four tables, all in schema `platform`, which is **cross-tenant and carries no RLS**
(`07-multi-tenant-architecture` §7.7 schema registry; `00_master` § PHASE 2 COMMAND → Entities).
`platform.*` always lives on the shared DB and is never replicated to a dedicated DB (§7.1 platform
schema isolation rule).

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
4. Keycloak issues an RS256 access token (15 min) + refresh token (7 days);
   the ephemeral credential is discarded
5. tenant_id / user_id / role are embedded by the protocol mappers (§5.4.2)
6. Refresh proxies grant_type=refresh_token — Keycloak rotates natively (refreshTokenMaxReuse: 0)
```

OTP send/verify is a **custom lightweight NestJS module inside the identity module — not a Keycloak
extension** — while token issuance always goes through Keycloak Direct Grant
(`00_master` § PHASE 2 COMMAND; QM-4 authentication).

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

**Migration rollback.** Every migration in this phase needs a verified rollback script in
`prisma/rollbacks/`, kept outside `prisma/migrations/` so `prisma migrate deploy` does not treat it
as a migration and fail P3015 (QM-9). Three Phase-2 migrations currently violate this — see § 14
OQ-7.

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
| Migration rollback scripts           | ⚠️ partial | 89 migrations, 83 conforming rollbacks — see § 14 OQ-7                                         |

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

| ID   | Question                                                                                                                                                                                                                                                                                                                                                                                                                              | Status                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| OQ-7 | QM-9 requires a committed rollback script for **every** migration. Five have none: `20260723000001_add_estimated_completion_date_to_projects`, `20260723000002_add_timezone_to_tenants`, `20260723000003_notification_delivery_rules`, `20260730000001_add_department_to_users`, `20260730000002_add_user_additional_roles`. A sixth, `20260605000002_file_service`, has a rollback named `_rollback.sql` instead of `.rollback.sql`. | Open — QM-9 gap            |
| OQ-8 | `platform.users` on disk has `department` and a `UserAdditionalRole` model; `00_master` § PHASE 2 COMMAND → Entities describes neither, and `tenant_memberships` there carries a single `role`. The decision that introduced multiple roles per user was not located.                                                                                                                                                                 | Open — needs a source      |
| OQ-9 | `05-security-compliance` §5.4 assigns Path A to field roles and Path B to office roles. Whether a single user may use **either** path is not stated either way in the specification set.                                                                                                                                                                                                                                              | Open — needs a PO decision |

Recorded, not resolved — per [README § Open questions](README.md#open-questions-register).
