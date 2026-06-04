# @cos/database

Prisma pagination utilities, UUID generation, and database retry helpers.

## Purpose

Shared database utilities used by all Node.js backend services. Implements cursor-based pagination, `cuid2`-based ID generation, and the `withRetry` helper for Prisma transient errors (connection drops, serialisation failures). See ADR-015 for the retry pattern design.

## Public API

```typescript
import { paginate, decodeCursor, encodeCursor } from '@cos/database';
import { generateId } from '@cos/database';
import { withRetry, isRetryableError } from '@cos/database';
```

### `paginate(prismaModel, args, cursorField?)`

Cursor-based pagination wrapper. Returns `{ data, nextCursor, hasMore }`.

### `generateId()`

Returns a `cuid2` string suitable for use as a primary key.

### `withRetry(fn, options?)`

Wraps a Prisma operation with exponential backoff. Retries on `P1001` (connection refused), `P1002` (timeout), `P2034` (transaction conflict). Default: 3 attempts, 50ms initial delay, factor 2.

## Dependencies

- `@prisma/client` — type import only (runtime client is injected — Rule 33)
- `@paralleldrive/cuid2` — ID generation
- `@cos/logger` — logs retry attempts at WARN level

## Configuration

No direct environment variable dependencies. The calling service provides the Prisma client.

## Usage

```typescript
import { paginate, withRetry } from '@cos/database';

// Cursor-based list endpoint
const result = await paginate(prisma.project, {
  where: { tenantId },
  orderBy: { createdAt: 'desc' },
  take: 20,
  cursor: decodeCursor(req.query.cursor),
});

// Retry on transient DB errors
const project = await withRetry(() =>
  prisma.project.create({ data: { ... } })
);
```

## Notes

- ADR-015: retry helpers exist because PgBouncer transaction mode can cause transient `ECONNRESET` on pool exhaustion — callers should not handle retry logic themselves
- Use `jest.useFakeTimers()` + `await jest.runAllTimersAsync()` in tests for retry chains (Rule 30)
- `import type { PrismaClient }` in test helpers — prevents mobile bundle failure (Rule 33)
