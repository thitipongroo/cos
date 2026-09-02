---
paths:
  - "infrastructure/kubernetes/pgbouncer/**"
  - "docker-compose*.yml"
  - "**/*prisma.service.ts"
  - "packages/@cos/database/**"
---

# QM-18 — Connection Pool Management

Indexed in: `context.md` §QUALITY MANDATES

Isolation model:

- **STARTER/PROFESSIONAL** — Shared DB + tenant_id + RLS (spec §7.7). `app.current_tenant_id` set at
  request start; RLS enforces tenant isolation at DB level.
- **ENTERPRISE** — Dedicated DB per tenant. `platform.tenants.dedicated_db_url` non-NULL routes all
  domain queries to the tenant's own PostgreSQL instance (spec §7.1).

Direct application-to-PostgreSQL connections do not scale: each pod holds a connection pool, and with
many tenants and replicas, PostgreSQL `max_connections` is exhausted. A connection pooler is mandatory.

- **PgBouncer is the required connection pooler** for all environments (staging + production); deployed as a Kubernetes `Deployment` (not a sidecar) with a `PodDisruptionBudget` of `minAvailable: 1`; configuration committed to `infrastructure/kubernetes/pgbouncer/` (Phase 17)
- **Transaction mode is required** — `SET LOCAL app.current_tenant_id` is transaction-scoped and reverts on `COMMIT`/`ROLLBACK`, making transaction pooling safe; do NOT use session mode or statement mode
- **Session mode is prohibited** — incompatible with horizontal pod autoscaling (connections are pinned to a pod)
- **Statement mode is prohibited** — incompatible with multi-statement transactions
- Application layer must connect to PgBouncer address — never directly to PostgreSQL port `5432`; integration test must assert connection string resolves to PgBouncer, not the database host
- **Baseline configuration** (tune before Stage 2 go-live based on Grafana observations):
  - `default_pool_size = 25` per database
  - `max_client_conn = 1000`
  - `server_idle_timeout = 600` seconds
- **Grafana must expose** `pgbouncer_pools_client_active`, `pgbouncer_pools_server_active`, `pgbouncer_pools_client_waiting`, `pgbouncer_databases_pool_size`; alert policy: fire P2 incident when `client_waiting > 10` sustained for > 30 seconds
- **Tenant scale limit documentation** — before Stage 2 go-live, load-test the PgBouncer + PostgreSQL stack and record the maximum concurrent tenants at acceptable latency in `docs/architecture/tenant-scale-limits.md`; this threshold determines when DatabaseSharding evaluation must begin
- Local development (Docker Compose): PgBouncer container required in `docker-compose.yml`; dev mode Vault and PgBouncer must start together with the application

**Graceful shutdown — close every long-lived handle (ADR-034):**

- Every provider that owns a long-lived client (Redis, PrismaClient, ClickHouse, or any socket/HTTP
  client) MUST close it on shutdown: implement `OnModuleDestroy` and call `redis.quit()` /
  `prisma.$disconnect()` / `client.close()`. Reference implementations: `finance/exchange-rate.service.ts`,
  `identity/otp/otp.service.ts`, `identity/mfa/mfa.service.ts`.
- A client created inside a module factory (no provider owns it) is closed from the **module class's**
  `OnModuleDestroy` (Nest invokes lifecycle hooks on module classes) — e.g. `AnalyticsModule` (cache Redis +
  ClickHouse). For `@nestjs/throttler`, pass the **Redis URL** (not a pre-built `new Redis(...)`) to
  `ThrottlerStorageRedisService` so the library owns and closes the client (`disconnectRequired=true`).
- Resources started OUTSIDE Nest DI (the OpenTelemetry SDK + Prometheus exporter in `main.ts`) are closed
  via a provider implementing `OnApplicationShutdown` (`shared/tracing-shutdown.service.ts` → `shutdownTracing()`).
- `main.ts` MUST call `app.enableShutdownHooks()` before `app.listen()` so `SIGTERM`/`SIGINT` (K8s rolling
  deploy) run the hooks above; without it they only fire on an explicit `app.close()` (tests).
- Integration config MUST NOT use `forceExit` — with handles closed Jest exits on its own; a future hang then
  signals a real new leak (diagnose with `--detectOpenHandles`, never mask with `forceExit`).
- Every new `onModuleDestroy`/`onApplicationShutdown` needs a unit test (invoke the hook, assert
  `quit`/`$disconnect`/`close`/`shutdownTracing` called) to keep QM-1 100% line+branch coverage.
