# ADR-034: Graceful shutdown — close every long-lived resource handle on shutdown

**Date:** 2026-06-28
**Status:** Accepted
**Deciders:** Product owner, Engineering Lead
**Tags:** architecture | infra

---

## Context

Across the backend monolith, long-lived clients were constructed directly inside provider
constructors and module factories without any lifecycle cleanup:

- `new PrismaClient()` as a class field in 9 providers (`AuditInterceptor`, `TenantMiddleware`,
  `TenantService`, `UserService`, `IdentityService`, `KeycloakJwtStrategy`,
  `VendorIdentityRepository`, `NotificationRepository`, `MfaService`).
- `new Redis()` (ioredis) in `OtpService`, `MfaService`, the `ThrottlerModule` storage factory,
  and the `AnalyticsModule` cache factory.
- A ClickHouse client in `AnalyticsModule`.
- The OpenTelemetry SDK (+ Prometheus exporter HTTP server) started in `main.ts`, **outside** the
  Nest DI container.

Each ioredis client keeps a TCP socket and a reconnect timer; each PrismaClient keeps a query-engine
connection; the ClickHouse client and OTel exporter keep their own sockets/servers. None were closed
on `app.close()`. Two concrete failures resulted:

1. **Tests hung.** Jest integration specs passed in ~14s, then the runner never exited — the leaked
   handles kept the event loop alive. It was masked with `forceExit: true`, which papers over the
   leak instead of closing it.
2. **Abrupt production shutdown.** On `SIGTERM` (e.g. a Kubernetes rolling deploy) connections were
   severed when the pod was killed rather than drained/closed, risking truncated writes and noisy
   connection-reset errors downstream.

The pattern already existed in two places (`finance/exchange-rate.service.ts`,
`sync/tombstone-prune.service.ts` implement `onModuleDestroy`), but was not applied consistently or
written down as a rule.

## Decision

1. **Every provider that owns a long-lived client closes it via a Nest lifecycle hook.**
   - Redis / Prisma owned by a provider → implement `OnModuleDestroy` and call `redis.quit()` /
     `prisma.$disconnect()`.
   - A client created inside a module factory (no provider owns it) → close it from the module
     class's `OnModuleDestroy` (Nest invokes lifecycle hooks on module classes), or hand ownership to
     a library that closes it itself. For the throttler, pass the **Redis URL** (not a pre-built
     instance) to `ThrottlerStorageRedisService` so the library owns and closes the client
     (`disconnectRequired=true`).
   - The OpenTelemetry SDK is started outside Nest DI, so a dedicated `TracingShutdownService`
     implements `OnApplicationShutdown` (the last lifecycle hook, after spans flush) and calls
     `shutdownTracing()`.

2. **`main.ts` calls `app.enableShutdownHooks()`** before `app.listen()`, so `SIGTERM`/`SIGINT`
   trigger the hooks above in production. In tests the hooks fire via the explicit `app.close()` in
   `afterAll`.

3. **No `forceExit` in `jest.integration.config.js`.** With handles closed, Jest exits on its own;
   if it ever hangs again, run `--detectOpenHandles` to find the new unclosed handle rather than
   masking it.

## Rationale

`onModuleDestroy` / `OnApplicationShutdown` are the idiomatic Nest mechanism and tie cleanup to the
same lifecycle that `app.close()` and `enableShutdownHooks()` already drive — so the same code path
covers both tests and production. `forceExit` was rejected because it hides leaks (a future genuine
leak would go unnoticed) and does not give clients a chance to drain. Refactoring every
`new PrismaClient()` into a single shared injected provider was rejected as out of scope: it would
churn many unit-test mocks for no shutdown-correctness gain; the per-provider hook is low-risk and
runs only at shutdown.

## Consequences

### Positive

- Jest integration suite exits cleanly with no `forceExit`; a real future leak surfaces as a hang.
- Production pods drain Redis/Prisma/ClickHouse/OTel connections gracefully on `SIGTERM`.
- A single documented convention (QM-18 + GLOBAL EXECUTION RULE) for all future providers.

### Negative

- Each provider owning a client carries a small `onModuleDestroy` method and a unit test for it
  (required to keep coverage at 100% lines/branches per QM-1).

### Neutral

- Module-scoped clients (created in factories) are closed from the module class hook rather than a
  provider — a deliberate, contained exception to "providers close their own clients".

## References

- context.md → QM-18 (Connection Pool Management) and GLOBAL EXECUTION RULES
- docs/specifications/30-testing-strategy.md §30.4 (Integration Testing — Harness conventions)
- backend/src/main.ts (`enableShutdownHooks`), backend/src/shared/tracing-shutdown.service.ts
- [ADR-031](031-tenant-context-resolution-and-app-user-rls.md) — `TenantPrismaService` (singleton)
  already disconnects on destroy
