# Construction OS — CORS Policy

> **Purpose:** Define allowed origins for Cross-Origin Resource Sharing (CORS) per environment.
> Source: QM-4. **`*` (wildcard) is forbidden in production.**
>
> Implemented in:
>
> - NestJS: `backend/src/main.ts` → `app.enableCors(corsOptions)` where `corsOptions` is loaded
>   from environment-specific config (`@cos/config`)
> - Fastify file-service: `services/file-service/src/app.ts` → `fastify.register(cors, corsOptions)`

---

## Allowed origins per environment

### Production

```http
Access-Control-Allow-Origin: https://app.construction-os.app
```

Only the production web app origin is allowed. Mobile apps use the native HTTP stack and do not
send `Origin` headers — no CORS exemption needed for React Native.

| Origin                              | Allowed | Justification                             |
| ----------------------------------- | ------- | ----------------------------------------- |
| `https://app.construction-os.app`   | YES     | Production web app                        |
| `https://admin.construction-os.app` | YES     | Admin panel (Phase 2+)                    |
| `*`                                 | **NO**  | Forbidden per QM-4                        |
| `http://` (any)                     | **NO**  | HTTP not allowed; TLS 1.3 enforced (QM-4) |

### Staging

```http
Access-Control-Allow-Origin: https://staging.construction-os.app
```

| Origin                                      | Allowed |
| ------------------------------------------- | ------- |
| `https://staging.construction-os.app`       | YES     |
| `https://staging-admin.construction-os.app` | YES     |

### Development (local)

```http
Access-Control-Allow-Origin: http://localhost:3000
```

| Origin                  | Allowed                               |
| ----------------------- | ------------------------------------- |
| `http://localhost:3000` | YES (web app dev server)              |
| `http://localhost:3001` | YES (admin dev server, if applicable) |
| `http://localhost:*`    | NO — only known ports                 |

---

## Allowed methods

```http
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
```

---

## Allowed headers

```http
Access-Control-Allow-Headers:
  Content-Type,
  Authorization,
  X-Tenant-ID,
  X-Request-ID,
  traceparent,
  tracestate
```

`X-Tenant-ID` — tenant resolution header (multi-tenant routing).
`traceparent` / `tracestate` — W3C Trace Context propagation (QM-8).

---

## Credentials

```http
Access-Control-Allow-Credentials: true
```

Required for cookie-based session (Keycloak OIDC code flow in web app).

---

## Preflight cache

```http
Access-Control-Max-Age: 600
```

10-minute preflight cache — reduces OPTIONS requests without excessive staleness.

---

## Exposed headers

```http
Access-Control-Expose-Headers:
  X-RateLimit-Limit,
  X-RateLimit-Remaining,
  X-RateLimit-Reset,
  X-Request-ID,
  Retry-After
```

Rate limit headers exposed so web/mobile clients can implement backoff (QM-7).

---

## Configuration implementation

`backend/src/config/cors.config.ts`:

```typescript
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

const ALLOWED_ORIGINS: Record<string, string[]> = {
  production: ['https://app.construction-os.app', 'https://admin.construction-os.app'],
  staging: ['https://staging.construction-os.app', 'https://staging-admin.construction-os.app'],
  development: ['http://localhost:3000', 'http://localhost:3001'],
};

export function getCorsOptions(env: string): CorsOptions {
  const origins = ALLOWED_ORIGINS[env] ?? [];
  return {
    origin: (origin, callback) => {
      if (!origin || origins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS policy`));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Tenant-ID',
      'X-Request-ID',
      'traceparent',
      'tracestate',
    ],
    exposedHeaders: [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'X-Request-ID',
      'Retry-After',
    ],
    credentials: true,
    maxAge: 600,
  };
}
```

---

## Adding a new origin

1. Confirm the origin is under Construction OS control (no third-party origins allowed)
2. Add origin string to the appropriate environment in `cors.config.ts`
3. Update this document with the origin and justification
4. PR review by engineering lead before merge

**Third-party origins are never added to CORS allowlist.** If a third-party iframe or fetch is
required, use a server-side proxy endpoint instead.

---

## Review schedule

| Trigger                 | Action                                                              |
| ----------------------- | ------------------------------------------------------------------- |
| New subdomain / web app | Add origin; update this document                                    |
| Stage 1 → Stage 2       | Confirm no `localhost` origins present in production config         |
| Quarterly               | Audit allowed origins; remove any decommissioned subdomains         |
| External pentest        | Review CORS-related findings (`docs/registers/pentest-findings.md`) |
