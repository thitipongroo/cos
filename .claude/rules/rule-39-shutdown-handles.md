---
paths:
  - "backend/src/**/*.service.ts"
  - "backend/src/**/*.module.ts"
  - "backend/src/main.ts"
  - "services/**/*.ts"
---

# Rule 39 — Close every long-lived handle

Indexed in: `context.md` §GLOBAL EXECUTION RULES

- Rule 39 — **Close every long-lived handle on shutdown** (prevents leaked Redis/Prisma/ClickHouse/OTel
  handles → Jest integration runner hangs after specs pass, and ungraceful production shutdown on SIGTERM).
  Authoritative decision: ADR-034; full mandate in QM-18 (Graceful shutdown).
  (a) Provider that owns a client → `OnModuleDestroy` → `redis.quit()`/`prisma.$disconnect()`/`client.close()`
  (b) Module-factory client (no provider owns it) → close from the **module class's** `OnModuleDestroy`; for
  `@nestjs/throttler` pass the Redis URL (not a pre-built `new Redis`) so the library closes it
  (c) Resources outside Nest DI (OTel SDK in `main.ts`) → provider with `OnApplicationShutdown` → `shutdownTracing()`
  (d) `main.ts` MUST call `app.enableShutdownHooks()` before `app.listen()`; never use `forceExit` to mask a leak
  (e) Every new `onModuleDestroy`/`onApplicationShutdown` needs a unit test → keep QM-1 100% line+branch coverage
