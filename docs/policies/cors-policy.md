# Construction OS — CORS Policy

> **Purpose:** Define allowed origins for Cross-Origin Resource Sharing (CORS) per environment.
> Source: QM-4. **`*` (wildcard) is forbidden in production.**
>
> Implemented in:
>
> - NestJS API: `backend/src/main.ts` → `app.enableCors({ ... })`, written inline. The allowed
>   origins come from the `CORS_ORIGINS` environment variable, split on commas, defaulting to
>   `http://localhost:3001` when it is unset.
> - Fastify file-service: `services/file-service/src/main.ts` → `fastify.register(cors, { origin: false })`.
>   Cross-origin requests are REFUSED outright: the browser never talks to this service directly,
>   it goes through the API, so the service has no origin to allow.

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

The NestJS API configures CORS inline, in `backend/src/main.ts`:

```typescript
app.enableCors({
  origin: process.env['CORS_ORIGINS']?.split(',') ?? ['http://localhost:3001'],
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['authorization', 'content-type'],
  credentials: true,
});
```

`methods` is listed explicitly for a reason worth keeping: without it the preflight advertises only
`GET,HEAD,POST`, and the browser blocks every cross-origin `PATCH`/`PUT`/`DELETE` — incident
acknowledge, permit approve — with `net::ERR_FAILED`.

**Where the code and this policy differ.** Recorded here rather than reconciled, because closing
either gap is a change to the service, not to a document:

| This policy says                                                          | `main.ts` does                                                  |
| ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `Access-Control-Max-Age: 600`                                             | Not set — the browser applies its own default                   |
| Requests carry `X-Tenant-ID`, `X-Request-ID`, `traceparent`, `tracestate` | `allowedHeaders` admits `authorization` and `content-type` only |
| Rate-limit and `Retry-After` headers are readable cross-origin            | No `exposedHeaders`, so a browser cannot read them              |
| Origins are chosen per environment                                        | One `CORS_ORIGINS` variable, whatever the deployment sets       |

---

## Adding a new origin

1. Confirm the origin is under Construction OS control (no third-party origins allowed)
2. Add the origin to the API's `CORS_ORIGINS` environment variable for that deployment. There is
   no per-environment origin list in this repository, and nothing sets the variable today —
   `docker-compose.yml` sets only `TEMPORAL_CORS_ORIGINS`, which is Temporal's own UI, and the
   `cos-backend` chart does not set it at all. Every environment therefore falls back to the
   `http://localhost:3001` default in `main.ts` until someone supplies it.
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
