# @cos/logger

Structured JSON logging based on Pino. The only approved logger for all Construction OS services.

## Purpose

Enforces QM-8 observability standards: every log entry must include `trace_id`, `span_id`,
`tenantId`, `userId`, `service`, `module`, and `event`. PII must never appear in log fields —
use IDs only. Never use `console.log`.

## Public API

```typescript
import { createLogger, LogContext } from '@cos/logger';
```

### `createLogger(service, module): Logger`

Returns a Pino logger pre-configured with JSON output, structured context, and log-level control via `LOG_LEVEL` env var.

```typescript
interface LogContext {
  tenantId?: string;
  userId?: string;
  traceId?: string; // from OpenTelemetry span
  spanId?: string;
  event?: string; // e.g. 'purchase-order.created'
  durationMs?: number;
  metadata?: Record<string, unknown>;
}
```

Log methods: `.info(ctx, msg)`, `.warn(ctx, msg)`, `.error(ctx, msg)`, `.debug(ctx, msg)`.

## Dependencies

- `pino` — high-performance JSON logger
- `@cos/tracing` — used by callers to inject `traceId`/`spanId`

## Configuration

| Variable    | Description                                                         |
| ----------- | ------------------------------------------------------------------- |
| `LOG_LEVEL` | `trace` \| `debug` \| `info` \| `warn` \| `error` (default: `info`) |
| `NODE_ENV`  | `development` → pretty-prints; `production` → raw JSON              |

## Usage

```typescript
import { createLogger } from '@cos/logger';

const logger = createLogger('cos-backend', 'procurement');

logger.info(
  { tenantId, userId, event: 'purchase-order.created', durationMs: 45 },
  'PO created successfully',
);

// ❌ Never
console.log('PO created'); // violates QM-8
```

## Log Level Discipline

| Level   | When to use                                                       |
| ------- | ----------------------------------------------------------------- |
| `DEBUG` | Development only — verbose internals                              |
| `INFO`  | Business events (entity created, workflow transitioned)           |
| `WARN`  | Recoverable anomaly (retry attempt, rate limit approaching)       |
| `ERROR` | Requires investigation (unhandled exception, integration failure) |

## Notes

- QM-8: logs stored in Loki (30 days hot, 1 year cold, 7 years compliance archive)
- Log retention schedule: `docs/policies/log-retention-policy.md` (created at Phase 15)
- PII rule: log `userId` (UUID) only — never email, phone, or name fields
