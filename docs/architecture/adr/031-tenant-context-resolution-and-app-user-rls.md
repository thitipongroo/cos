# ADR-031: Tenant context resolution after auth + dedicated `app_user` role for RLS enforcement

**Date:** 2026-06-23
**Status:** Accepted (amended 2026-06-26 — see [Update](#update-2026-06-26--cls-propagation-under-fastify-tenantprismaservice-is-a-singleton))
**Deciders:** Product owner / engineering lead
**Tags:** architecture | security | data

---

## Context

Two related problems were found while bringing the multi-tenant request pipeline up end-to-end:

1. **Tenant context could not be resolved in a pre-auth middleware.** Spec §7.7 and §5.4.1
   specified a `TenantMiddleware` that runs "before any controller" and reads the tenant/user
   from the validated JWT (`req.user`). But NestJS executes **middleware before guards**
   ([request lifecycle](https://docs.nestjs.com/faq/request-lifecycle)), and the Passport
   `JwtAuthGuard` is what assigns the strategy's `validate()` return to `req.user`. So the
   middleware always ran *before* `req.user` existed → every authenticated request failed
   with "Missing tenant context". Under the Fastify adapter the middleware additionally
   received the raw Node request (`req.path` undefined), compounding the breakage.

2. **RLS was not actually enforced.** Domain tables have RLS policies targeting `app_user`,
   but the application connected as `cos` — a **superuser and table owner**, which **bypasses
   RLS** (owner/superuser are exempt even under `FORCE ROW LEVEL SECURITY`). Tenant isolation
   therefore relied solely on application-layer `WHERE tenant_id` filters; the RLS layer
   specified as the *primary* isolation mechanism (§7.7) was inert. The `app_user` role also
   had no `LOGIN`/password and was granted on only 9 of 15 domain schemas.

External research (AWS SaaS Factory, NestJS docs, Prisma RLS extension, Citus, PlanetScale,
Bytebase) confirms the idiomatic placement is **resolve tenant from the validated token after
auth** and **connect as a non-owner role so RLS applies**.

## Decision

1. **Resolve tenant context after authentication, not in a pre-auth middleware:**
   - `KeycloakJwtStrategy.validate()` rejects tokens missing `tenant_id`/`role`, looks up
     `platform.tenants` (active check, `tenant_code`, `dedicated_db_url`), and returns an
     `AuthenticatedUser` (→ `req.user`).
   - A global `TenantContextInterceptor` projects `req.user.*` onto
     `req.{tenantId, userId, userRole, tenantCode, dedicatedDbUrl}` before the handler.
     *(Unreliable under the Fastify adapter — see Update 2026-06-26.)*
   - `TenantPrismaService` (request-scoped) reads the context **lazily in `run()`** (request-
     scoped providers are constructed before guards run, so it cannot read it in the
     constructor) and wraps each call in a transaction with `SET LOCAL app.current_tenant_id`.
     *(Now a singleton reading CLS — see Update 2026-06-26.)*
   - `TenantMiddleware` is no longer registered (kept only for the `TenantRequest` type + its
     unit tests).

2. **Tenant-scoped queries connect as a non-superuser `app_user` role** (`APP_DATABASE_URL`,
   via PgBouncer) so RLS is enforced. `app_user` is granted `LOGIN` + a password and CRUD +
   default privileges on all 15 domain schemas (migration `20260623000001`). Platform /
   cross-tenant / admin services keep the privileged `cos` connection (`DATABASE_URL`).

3. **Exactly one `AS PERMISSIVE` tenant-isolation policy per domain table**, named
   `rls_tenant_isolation` (migration `20260623000002` consolidates three legacy conventions —
   `tenant_isolation` AS RESTRICTIVE, `rls_tenant_isolation` AS PERMISSIVE, and
   `<table>_tenant_isolation` AS PERMISSIVE — into this single form). Rationale: PostgreSQL
   combines PERMISSIVE policies with OR and RESTRICTIVE with AND, but a *lone* RESTRICTIVE policy
   grants no access (RESTRICTIVE narrows, never grants) — so the spec's original `AS RESTRICTIVE`
   single-policy template would have denied every row; it only worked because a redundant
   PERMISSIVE duplicate happened to grant access. With one policy per table the OR/AND distinction
   is moot, so the canonical form is a single PERMISSIVE policy, matching AWS SaaS Factory and
   Crunchy Data's tenant-isolation examples. Keeping it to one policy also avoids the OR-widening
   footgun (a second permissive lookup policy widening access across tenants). The `platform`
   schema is excluded — its tables carry deliberate bespoke policies (cross-tenant `rls_tenants_read`
   lookup, `rls_users_tenant` incl. system users, immutable `rls_audit_*`).

## Rationale

- Middleware-before-guards is a fixed NestJS ordering; the spec's pre-auth middleware was not
  implementable as written. Doing resolution in the auth strategy + an interceptor is the
  documented, idiomatic placement and runs only on authenticated routes.
- RLS only enforces for non-owner, non-superuser roles. Splitting connections — `app_user`
  for tenant-scoped domain data (RLS-enforced) vs `cos` for privileged platform/cross-tenant
  operations — gives real DB-level isolation while keeping the ~7 cross-tenant services
  working. Alternatives rejected: (a) keep everything on `cos` (RLS never enforced);
  (b) move all connections to `app_user` (breaks platform writes, audit, tenant/user
  provisioning which are cross-tenant by design).

## Consequences

### Positive

- RLS is now actually enforced on tenant-scoped domain data (verified: a non-owner session
  with tenant A sees only tenant A's rows; another tenant sees zero).
- Authenticated requests work; the design matches mainstream multi-tenant SaaS guidance.

### Negative

- Two DB roles to manage (`cos`, `app_user`) and an extra `APP_DATABASE_URL` + PgBouncer
  userlist entry. Local-dev `app_user` password lives in a migration; production must inject
  it via Vault / Secrets Manager (spec §5.2, QM-4).

### Neutral

- Behaviour/outcomes of §7.7 (active-tenant check, `dedicatedDbUrl ?? shared`, RLS,
  `platform.*` on shared DB) are preserved; only the *mechanism* (where resolution runs and
  which role connects) changed.
- RLS policies read the tenant GUC as `NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid`
  so a missing/empty GUC yields zero rows instead of an `invalid input syntax for uuid` error
  (defence-in-depth; the app always sets the GUC via `TenantPrismaService.run`). The phase16
  RLS migration was also made idempotent (added the missing `DROP POLICY IF EXISTS` for the
  `rls_audit_select` / `rls_audit_insert` policies so re-applies don't fail).

## Update (2026-06-26) — CLS propagation under Fastify; `TenantPrismaService` is a singleton

Bringing the request pipeline up on `@nestjs/platform-fastify` surfaced a second ordering problem
beyond the original middleware-before-guards one. **Fastify clones the request object** between the
guard and the downstream pipeline, so the `req.user` that Passport assigns in `JwtAuthGuard` — and the
`req.*` fields the `TenantContextInterceptor` projects from it — did **not** reach interceptors or
request-scoped providers. Every authenticated tenant-scoped call still failed with
"Tenant context missing from request", even though auth itself succeeded.

**Resolution — carry the context in CLS (AsyncLocalStorage), not on the request object:**

- Added `nestjs-cls`. `ClsModule.forRoot({ global: true, middleware: { mount: true, useEnterWith: true } })`
  opens a CLS context per request. `useEnterWith: true` is **required** under Fastify, whose middleware
  does not await the remainder of the request inside the `cls.run()` callback.
- `JwtAuthGuard.handleRequest()` publishes `tenant_id, user_id, role, tenantCode, dedicatedDbUrl` into
  CLS — the one place that sees the validated user reliably under Fastify (it receives the user as a
  direct argument). Helpers in `shared/context/cls-context.ts` (`clsTenantId()`, `clsUserId()`,
  `clsDedicatedDbUrl()`) read it back, guarded by `cls.isActive()`.
- **`TenantPrismaService` is now a singleton** (was `Scope.REQUEST`). It reads the tenant context from
  CLS in `run()` and caches one `PrismaClient` per datasource URL. This also removes the
  per-request provider-instantiation and connection-cap cost.
- `TenantContextInterceptor` is retained as a secondary path (it still projects `req.user.*` onto
  `req.*` for non-Fastify code paths / handlers that read `req`); handlers that need a value fall back
  to CLS, e.g. `WorkerController.getMyWorker` uses `req.userId ?? clsUserId()`.
- **Security fix found in passing:** the `sync` and `workforce` controllers had no `@UseGuards(JwtAuthGuard)`
  and were reachable unauthenticated; the guard was added (which is also what populates CLS for them).

What did **not** change: the `app_user` / `cos` split (Decision §2), the single PERMISSIVE
`rls_tenant_isolation` policy (Decision §3), and the `SET LOCAL app.current_tenant_id` mechanism — only
*how* the resolved context travels from the guard to `TenantPrismaService` (CLS instead of the cloned
request). Coverage: `tenant-prisma.service`, `jwt-auth.guard`, `cls-context`, and the touched
controllers are at 100% line/branch.

## References

- Spec §7.7 (07-multi-tenant-architecture.md) — routing mechanism (updated)
- Spec §5.4.1 (05-security-compliance.md) — JWT claim enforcement (updated)
- Spec §7.9 — PgBouncer / connection routing; §09 §9.7.3 — RLS migration rules
- [ADR-008](008-shared-db-tenant-id-rls.md) — shared-DB + tenant_id + RLS (this refines its enforcement mechanism)
- NestJS request lifecycle: <https://docs.nestjs.com/faq/request-lifecycle>
- AWS multi-tenant data isolation with PostgreSQL RLS: <https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/>
