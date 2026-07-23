# ADR-015: Database Retry Helper Pattern for Prisma Transient Errors

**Date:** 2026-05-31
**Status:** Accepted
**Deciders:** Engineering Lead
**Tags:** data, architecture

---

## Context

Prisma ORM calls against PostgreSQL can fail transiently due to write conflicts
(deadlocks), connection timeouts, or brief unavailability during failover. Without a
retry layer, these errors surface directly to API callers as 500 errors, even though a
simple retry would succeed.

The `@cos/database` package is the shared Prisma utility layer used by all NestJS
modules. A centralized retry helper here ensures consistent retry behavior across the
entire monolith without each module implementing its own retry logic.

The original `@cos/database` spec reference "(see ADR-008)" was incorrect — ADR-008 covers tenant isolation,
not retry helpers. Retry helpers are a separate concern documented here in ADR-015.

## Decision

Implement a `withRetry<T>` utility in `packages/@cos/database/src/retry.ts` with the following behaviour:

- **Retryable Prisma error codes:**
  - `P2034` — write conflict or deadlock (transaction-level, safe to retry)
  - `P1001` — database server unreachable (transient network issue)
  - `P1002` — database server timeout
- **Strategy:** exponential backoff with full jitter
- **Max retries:** 3 (configurable via options)
- **Base delay:** 100ms (configurable via options)
- **Delay formula:** `random(0, baseDelay * 2^attempt)` ms, capped at 5000ms
- **Non-retryable errors** (validation, unique constraint, foreign key): re-throw immediately without retry

```typescript
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: { maxRetries?: number; baseDelayMs?: number },
): Promise<T>;
```

## Rationale

**Why exponential backoff with jitter?**
Thundering herd: if many requests hit a deadlock simultaneously and all retry at the same
interval, they collide again. Full jitter spreads retries across a time window, reducing
collision probability.

**Why max 3 retries?**
3 retries covers the overwhelming majority of transient failures. Beyond 3 retries, the
error is likely structural (e.g. persistent overload), and retrying further delays the
error response to the caller without improving outcomes.

**Why centralize in @cos/database?**
All NestJS modules use `TenantPrismaService` from this package. Centralizing retry logic
here means a single implementation, single test suite, and consistent behaviour with no
risk of modules implementing subtly different retry strategies.

## Consequences

### Positive

- All Prisma calls across the entire monolith get consistent retry behaviour for free
- Reduces P0 incident rate from transient deadlocks during peak procurement approval windows
- Single test surface — retry logic tested once, not once per module

### Negative

- Retrying a failed transaction adds latency (up to ~700ms for 3 retries at 100ms base)
- Callers must ensure the wrapped function is idempotent — retrying a non-idempotent operation can cause duplicate side-effects

### Neutral

- Non-retryable errors (unique constraint, validation) pass through immediately with no added latency

## References

- `packages/@cos/database/src/retry.ts` — implementation
- [Prisma error reference](https://www.prisma.io/docs/reference/api-reference/error-reference)
- ADR-008 — Tenant Isolation: Shared DB + tenant_id + PostgreSQL RLS (current standard)
