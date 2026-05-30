# ADR-008: TenantPrismaService — Schema-per-Tenant ORM Pattern

**Date:** 2026-05-31
**Status:** Accepted
**Deciders:** Engineering Lead
**Tags:** data, architecture

---

## Context

Construction OS uses a schema-per-tenant isolation model: each tenant gets one PostgreSQL schema (e.g. `acme_corp`, `riverside_const`). All tenant data lives in that schema; the `platform` schema holds cross-tenant system tables (tenants, users, memberships).

Prisma does not natively support per-request schema switching. Without a wrapper, every module would need to manually issue `SET search_path` before each query, creating a risk of cross-tenant data leakage if a developer forgets.

Additionally, the application connects through PgBouncer in transaction pool mode (QM-18). `SET LOCAL search_path` is transaction-scoped and reverts on `COMMIT`/`ROLLBACK`, making it safe with connection pooling — but this only works inside an explicit transaction block.

## Decision

Implement `TenantPrismaService` (Phase 2, `backend/src/modules/tenant/`) as a **request-scoped NestJS provider** that wraps every database call in a schema-pinned transaction:

```typescript
// Every DB call goes through:
await this.prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe(`SET LOCAL search_path = ${tenantCode}`);
  return fn(tx);
});
```

Rules:
- `TenantPrismaService` is **request-scoped** (injected fresh per HTTP request — never singleton)
- `tenantCode` is extracted from the validated JWT claim at request entry (tenant middleware)
- Application connects to **PgBouncer port 6432** — never directly to PostgreSQL port 5432
- Migrations run per-schema via `prisma migrate deploy` with `SET search_path` per tenant
- Identity module tables live in schema `platform` and use the base `PrismaService` (not tenant-scoped)

## Rationale

**Why schema-per-tenant over shared schema + RLS?**
Schema-per-tenant provides hard isolation at the database level — a misconfigured query cannot leak data across tenants. Shared schema + RLS relies on the application correctly setting a session variable on every connection, which is easier to misconfigure. Schema-per-tenant has higher operational cost at hundreds of tenants, but is the correct choice for MVP scale and can be migrated to dedicated DB per tenant (EP-TENANT-003) for enterprise plans.

**Why SET LOCAL inside a transaction?**
`SET LOCAL` is transaction-scoped — it reverts automatically on `COMMIT` or `ROLLBACK`. This makes it safe with PgBouncer transaction pool mode, where a connection is returned to the pool after each transaction. `SET` (without LOCAL) would persist for the session, leaking tenant context to the next request on the same pooled connection.

**Why request-scoped?**
A singleton `TenantPrismaService` would hold one tenant's `search_path` across requests. Request scope ensures each request gets its own instance initialized with that request's tenant context.

## Consequences

### Positive

- Zero cross-tenant data leakage risk from application code — enforced structurally, not by convention
- Developer cannot forget to set tenant context — TenantPrismaService is the only valid DB entry point for tenant-scoped modules
- Compatible with PgBouncer transaction pool mode (QM-18)

### Negative

- Every DB call incurs a transaction overhead and one extra `SET LOCAL` statement
- Request-scoped providers cannot be injected into singleton providers — requires careful NestJS DI design
- Adding a new tenant requires provisioning a new schema and running migrations against it

### Neutral

- PgBouncer `default_pool_size = 25` per database is the baseline; tune before Stage 2 go-live based on observed `pgbouncer_pools_client_waiting` metrics (QM-18)

## References

- `backend/src/modules/tenant/tenant-prisma.service.ts` — implementation (Phase 2)
- `packages/@cos/database/src/index.ts` — shared Prisma utilities
- ADR-015 — Database retry helper pattern (separate concern)
- QM-18 — PgBouncer connection pool management
- EP-TENANT-003 — DedicatedDBIsolation (enterprise plan upgrade path)
