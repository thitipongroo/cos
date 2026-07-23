---
title: "ADR-015 — TenantPrismaService: Schema-per-tenant ORM Pattern"
status: Accepted
last_updated: "2026-06-01"
authors:
  - thitipongroo
---

# ADR-015 — TenantPrismaService: Schema-per-tenant ORM Pattern

**Status:** Accepted
**Date:** 2026-06-01
**Deciders:** Engineering team
**Supersedes:** N/A
**Related:** ADR-002 (Tiered Tenant Isolation), ADR-008 (Prisma as ORM)

## Context

Construction OS uses schema-per-tenant isolation as the PRIMARY mechanism for
multi-tenant data separation (ADR-002). Each tenant gets its own PostgreSQL
schema named `{tenant_code}` (e.g., `acme_corp`, `riverside_const`).

Every database query issued inside the NestJS backend must be routed to the
correct tenant schema. Without a consistent mechanism, developers could
accidentally issue cross-tenant queries or forget to set the schema entirely.

The chosen ORM (Prisma — ADR-008) does not natively support per-request
schema switching. A wrapper is required.

## Decision

Implement `TenantPrismaService` as a **request-scoped NestJS service** that
wraps `PrismaService` and enforces schema isolation by executing
`SET LOCAL search_path = "{tenant_code}", public` at the start of every
database transaction.

### Implementation

```typescript
// backend/src/shared/prisma/tenant-prisma.service.ts
@Injectable({ scope: Scope.REQUEST })
export class TenantPrismaService {
  async run<T>(fn: (tx: TenantTransaction) => Promise<T>): Promise<T> {
    const schema = this.tenantSchema; // derived from request context
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}", public`);
      return fn(tx as TenantTransaction);
    });
  }
}
```

`tenantSchema` is resolved from `RequestContextMiddleware`, which extracts the
`tenantCode` JWT claim and stores it on the request object.

### Why `SET LOCAL`

`SET LOCAL` is transaction-scoped: the search_path reverts automatically on
`COMMIT` or `ROLLBACK`. This makes it safe with PgBouncer in **transaction
mode** (QM-18), where connections are returned to the pool after each
transaction and cannot carry session-level state between requests.

`SET SESSION` would be incompatible with PgBouncer transaction mode because
the connection can be assigned to a different tenant on the next transaction.

### Defense-in-depth

Repository methods retain `where: { tenantId }` on all queries even inside
`run()`. This is intentional:

- If `RequestContextMiddleware` is bypassed (e.g., a future code path),
  the `tenantId` filter prevents cross-tenant data exposure.
- `tenantId` filters are load-bearing — do NOT remove them as "redundant".

## Consequences

### Positive

- Schema-per-tenant isolation is structurally enforced: cross-tenant access is
  impossible if `search_path` is set correctly.
- Compatible with PgBouncer transaction mode (QM-18).
- Transparent to repository and service code: they call `run()` without
  needing to know about schema names.
- `global` escape hatch allows cross-tenant operations for SYSTEM_ADMIN flows.

### Negative

- Every database call must be wrapped in `run()` — forgetting to wrap results
  in queries hitting the `public` schema (which may expose system tables).
- Request-scoped injection requires careful NestJS module setup to avoid
  scope contamination with singleton providers.

## Compliance

- QM-18 (Connection Pool Management): `SET LOCAL` is safe with PgBouncer
  transaction mode. Session mode is prohibited.
- QM-4 (Security): schema isolation prevents cross-tenant data access.
- Spec §Phase 2: "Prisma: schema-aware via TenantPrismaService — each request
  sets `SET LOCAL search_path = {tenant_code}`".
