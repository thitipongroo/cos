---
title: "ADR-008 — Prisma as ORM"
status: Accepted
last_updated: "2026-05-29"
authors:
  - thitipongroo
---

# ADR-008 — Prisma as ORM

**Status:** Accepted
**Date:** 2026-01-20
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

### 2. Safer schema-per-tenant implementation

The Prisma implementation uses `SET LOCAL` inside a `$transaction`:

```typescript
// TenantPrismaService.run()
return this.prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}", public`);
  return fn(tx);
});
```

`SET LOCAL` is scoped to the transaction and reverts automatically on commit or
rollback — fully safe with PgBouncer connection pooling.

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
- `SET LOCAL search_path` inside `$transaction`

## Consequences

- All migrations are Prisma format (`migration.sql` + `migration_lock.toml`)
- Per-tenant migration deploy: `prisma migrate deploy` with `SET search_path` wrapper
- New contributors should follow Prisma conventions
- The spec's `database/` directory at repo root

## Explicitly done

- Prisma setup — single ORM only
- Prisma owns migrations at `backend/prisma/`

---

## Alternatives Considered

| Option | Reason Rejected |
| --- | --- |
| TypeORM | Less type-safe client generation; raw query escape risk; no native `SET LOCAL` transaction scoping as clean as Prisma's `$transaction` |
| MikroORM | Smaller ecosystem; less Prisma-native tooling for schema-per-tenant search_path switching |
| Raw `pg` / `postgres.js` | No migration tooling; no type-safe query builder; schema evolution becomes manual |
| Drizzle ORM | Immature at decision time; no established Prisma-equivalent migration deploy workflow |

---

## References

- `docs/00-specifications/07-multi-tenant-architecture.md` §7.2 — schema-per-tenant `search_path` implementation using Prisma `$transaction`
- `docs/01-architecture/adr/002-schema-per-tenant.md` — isolation tier model that Prisma's `SET LOCAL` implements
