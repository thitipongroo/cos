---
title: 'ADR-018 — Prisma as ORM'
status: Accepted
last_updated: '2026-05-29'
authors:
  - thitipongroo
---

# ADR-018 — Prisma as ORM

**Status:** Accepted
**Date:** 2026-01-20 (renumbered from ADR-008 → ADR-018 on 2026-07-23 — ADR-008 collided
with the tenant-isolation decision, which kept the number; this ORM-choice decision moved
here, to a slot freed when the former Temporal ADR was consolidated into ADR-006)
**Deciders:** Engineering team

## Context

The original master spec (`00_master_construction_os.md`) specified the ORM
for all NestJS backend services.

## Decision

**Prisma** is the ORM for all NestJS backend services.

## Rationale

### 1. Type-safe client generation

Prisma generates a fully type-safe client directly from `schema.prisma`. Every
query, relation, and result type is statically known at compile time.

### 2. Safer tenant-isolation implementation

The Prisma implementation uses `SET LOCAL` inside a `$transaction` to scope the
per-request tenant context:

```typescript
// TenantPrismaService.run()
return this.prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
  return fn(tx);
});
```

`SET LOCAL` is scoped to the transaction and reverts automatically on commit or
rollback — fully safe with PgBouncer connection pooling. The isolation model is
shared-DB + tenant_id + PostgreSQL RLS (ADR-008); an earlier draft of this ADR
showed `SET LOCAL search_path` for schema-per-tenant, which ADR-008 retired.

### 3. Mature migration tooling

`prisma migrate dev` / `prisma migrate deploy` provide deterministic, versioned,
checksum-verified migrations.

### 4. `@cos/database` package scope

With Prisma, base entity classes are unnecessary — Prisma's
generated types fulfill this role. The package now exports cross-cutting
database utilities: `paginate()`, `parseSortOrder()`, `withRetry()`,
`toISOString()`, `generateId()`.

## Implementation from the spec

- `@cos/database/` — Prisma utility functions
- `backend/prisma/migrations/`
- Seeds live in `backend/prisma/seeds/` (when needed)
- `TenantPrismaService` (request-scoped NestJS service)
- Not needed — Prisma generates per-model types
- `SET LOCAL app.current_tenant_id` inside `$transaction` (RLS — ADR-008)

## Consequences

- All migrations are Prisma format (`migration.sql` + `migration_lock.toml`)
- Migration deploy: `prisma migrate deploy` runs once per global named schema (ADR-008)
- New contributors should follow Prisma conventions
- The spec's `database/` directory at repo root

## Explicitly done

- Prisma setup — single ORM only
- Prisma owns migrations at `backend/prisma/`

---

## Alternatives Considered

| Option                   | Reason Rejected                                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| TypeORM                  | Less type-safe client generation; raw query escape risk; no native `SET LOCAL` transaction scoping as clean as Prisma's `$transaction` |
| MikroORM                 | Smaller ecosystem; less Prisma-native tooling for `SET LOCAL` transaction-scoped tenant context                                        |
| Raw `pg` / `postgres.js` | No migration tooling; no type-safe query builder; schema evolution becomes manual                                                      |
| Drizzle ORM              | Immature at decision time; no established Prisma-equivalent migration deploy workflow                                                  |

---

## References

- `docs/specifications/07-multi-tenant-architecture.md` §7.7 — shared-DB + RLS
  `SET LOCAL app.current_tenant_id` implementation using Prisma `$transaction`
- ADR-008 (shared DB + tenant_id + RLS) — the isolation model `TenantPrismaService`
  implements; ADR-002 (tiered isolation) — schema-per-tenant is the mid-market upgrade path
