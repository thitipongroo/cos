# @cos/config

Environment configuration loader and validation using Zod.

## Purpose

Validates all required environment variables at startup with a clear error message listing every
missing/invalid variable. Prevents services from starting with incomplete configuration. All secrets are
injected via AWS Secrets Manager (cloud) or HashiCorp Vault (on-premise) — never hardcoded (QM-4).

## Public API

```typescript
import { loadConfig, getConfig, AppConfig } from '@cos/config';
```

### `loadConfig(): AppConfig`

Parses and validates `process.env` against the Zod schema. Throws with a detailed error if validation fails.
Call once at module startup.

### `getConfig(): AppConfig`

Returns the cached config after `loadConfig()` has been called. Throws if called before `loadConfig()`.

### `AppConfig` type

Full TypeScript type inferred from the Zod schema. All config fields are typed.

## Dependencies

- `zod` — schema validation and type inference

## Configuration (required variables)

| Variable              | Type   | Default       | Description                     |
| --------------------- | ------ | ------------- | ------------------------------- |
| `NODE_ENV`            | enum   | `development` | Runtime environment             |
| `PORT`                | number | `3000`        | HTTP listen port                |
| `LOG_LEVEL`           | enum   | `info`        | Pino log level                  |
| `DATABASE_URL`        | URL    | —             | PgBouncer connection string     |
| `REDIS_URL`           | URL    | —             | Redis connection string         |
| `KAFKA_BROKERS`       | string | —             | Comma-separated broker list     |
| `SCHEMA_REGISTRY_URL` | URL    | —             | Confluent Schema Registry       |
| `TEMPORAL_ADDRESS`    | string | —             | Temporal server address         |
| `OTEL_SERVICE_NAME`   | string | `cos-backend` | OTel service name               |
| `CORS_ORIGINS`        | string | optional      | Comma-separated allowed origins |

All secrets (database passwords, API keys) are injected as environment variables by the pod — not parsed here.

## Usage

```typescript
// In NestJS main.ts
import { loadConfig } from '@cos/config';

const config = loadConfig();
// If any required variable is missing → throws with list of errors and exits

// In any module
import { getConfig } from '@cos/config';

const { KAFKA_BROKERS, REDIS_URL } = getConfig();
```

## Notes

- `loadConfig()` is idempotent — subsequent calls return the same validated object
- Additional service-specific variables (e.g. `KEYCLOAK_BASE_URL`) are validated in the respective module's
  own config schema, extending `AppConfig`
- See `.env.example` at repo root for the full list of required variables with descriptions
