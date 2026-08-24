# ADR-041: Prisma 7 upgrade — node-postgres driver adapter + Prisma Config

**Date:** 2026-07-01
**Status:** Accepted
**Deciders:** Product owner / engineering lead
**Tags:** data, architecture

---

## Context

The platform pinned Prisma ORM at v5, then upgraded to v6.19.3 (multiSchema graduated to GA;
`@prisma/client` + the `prisma-client-js` generator continue to work unchanged). Prisma 7 is a
breaking release that removes two things the codebase relied on:

1. **`url` / `directUrl` on the `datasource` block in `schema.prisma`.** Prisma 7 rejects the schema
   with `P1012` and requires the migration/CLI connection URL to move to a `prisma.config.ts` file.
2. **The built-in Rust query engine's implicit connection.** A `PrismaClient` must now be given a
   **driver adapter** (`@prisma/adapter-pg` for PostgreSQL) — there is no schema `url` to connect
   from. `datasources: { db: { url } }` (used across the codebase to route to per-tenant / dedicated
   ENTERPRISE databases) is no longer accepted.

This touches the multi-tenant connection layer governed by **ADR-008** (shared DB + tenant_id +
RLS), **ADR-031** (lazy tenant/user context via CLS), and **QM-18** (PgBouncer transaction-mode
pooling; app connects via PgBouncer, migrations via a direct connection). Roughly 28 `new
PrismaClient(...)` call sites exist, including `TenantPrismaService` (the RLS tenant router) and the
Phase-25 enterprise-provisioning activities.

## Decision

Upgrade to Prisma **7.8.0** using the **`@prisma/adapter-pg`** driver adapter, and keep the
`prisma-client-js` generator + `@prisma/client` import path (the opt-in `prisma-client` generator is
**not** adopted in this change — it is a separate, larger migration).

1. Add **`prisma.config.ts`** at `backend/`. Its `datasource.url` is set to **`DIRECT_DATABASE_URL`**
   — Prisma Migrate/CLI needs the direct (non-PgBouncer) connection, exactly as the removed
   `directUrl` did (QM-18: PgBouncer transaction mode breaks migration DDL + advisory locks).
2. Remove `url` and `directUrl` from the `schema.prisma` `datasource` block (keep `provider` +
   `schemas`).
3. Introduce a single helper — `backend/src/shared/prisma/create-prisma-client.ts` —
   `createPrismaClient(connectionString = DATABASE_URL, options?)` that returns
   `new PrismaClient({ ...options, adapter: new PrismaPg({ connectionString }) })`. Every call site
   routes through it:
   - default app connection → `createPrismaClient()` (uses `DATABASE_URL`, i.e. PgBouncer at runtime);
   - per-tenant / dedicated DB → `createPrismaClient(url)` (preserves ADR-008 / §7.1 routing);
   - `TenantPrismaService` keeps its per-URL client `Map` and `SET LOCAL app.current_tenant_id`
     transaction wrapper unchanged — only the client construction changes.
4. Move the seed command into `prisma.config.ts` (`migrations.seed`).

## Rationale

- Prisma 7 gives no supported way to keep schema `url`/`directUrl`; the driver adapter is the
  officially required path. Verified empirically against Prisma 7.8.0 (the `P1012` error and the
  `prisma/config` `defineConfig`/`env` API), not from documentation alone.
- Keeping `@prisma/client` + `prisma-client-js` (rather than the new `prisma-client` generator)
  minimises blast radius: import paths and generated-client usage are unchanged, so only client
  _construction_ is touched.
- `@prisma/adapter-pg` uses `node-postgres`, whose default unnamed-prepared-statement protocol is
  compatible with PgBouncer transaction mode; the QM-18 PgBouncer-vs-direct split is preserved by
  routing runtime through `DATABASE_URL` and migrations through `DIRECT_DATABASE_URL`.
- A single helper keeps the ~28 call sites consistent and closeable (ADR-034 shutdown hooks are
  unaffected — clients still expose `$disconnect()`).

Alternatives rejected: (a) staying on Prisma 6 — viable and fully supported, but leaves the ORM a
major behind; (b) adopting the new `prisma-client` generator now — larger change (new output dir +
import paths) with no additional benefit for this upgrade.

## Consequences

### Positive

- Off the two-majors-behind position; on the supported Prisma 7 line.
- Connection routing is centralised in one helper instead of 28 ad-hoc `new PrismaClient` calls.

### Negative

- Adds runtime deps `@prisma/adapter-pg` + `pg`.
- PgBouncer behaviour with the pg adapter cannot be exercised by the integration suite (it runs
  against a direct Testcontainers Postgres). PgBouncer transaction-mode compatibility must be
  confirmed in staging before production rollout (QM-16 canary).

### Neutral

- RLS semantics unchanged: `SET LOCAL app.current_tenant_id` inside a `$transaction` still reverts on
  COMMIT/ROLLBACK; tenant-isolation integration tests remain the gate.

## References

- ADR-018 (Prisma as the ORM — ADR-041 upgrades that choice to v7), QM-18 (PgBouncer
  transaction mode; direct migration connection), ADR-008 (RLS), ADR-031 (CLS tenant
  context), ADR-034 (graceful shutdown of long-lived clients)
- Prisma 7 `P1012` datasource error; `prisma/config` `defineConfig` + `env`; `@prisma/adapter-pg`
