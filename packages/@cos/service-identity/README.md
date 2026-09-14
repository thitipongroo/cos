# @cos/service-identity

The identity client for Node services that cannot read `platform.users`: it asks the backend who a user is,
instead of believing the token's claims (ADR-107).

## Purpose

A user token's `tenant_id`, `user_id` and `role` are Keycloak user attributes. A valid signature proves Keycloak
minted the token, not that those attributes are true. This package forwards the caller's `Authorization` header
to the backend's `GET /api/v1/auth/identity`. The backend answers after realm binding, subject binding (ADR-106)
and the per-request database role (ADR-077), and this package returns that answer.

- **Fail closed.** Only a backend `401` means the token was refused (`IdentityRejectedError`). Anything else —
  unreachable, a timeout, a 403, a 404, a 5xx, a body without an identity, an unset URL — is
  `IdentityUnavailableError`. The claims are never used instead.
- **Cached** per SHA-256 of the `Authorization` header, for the shorter of the token's remaining lifetime and
  30 seconds, in a map capped at 10 000 entries (oldest evicted). A refusal is never cached; a token without
  `exp` is never cached.

Used by `services/file-service` and `services/credential-service`. `services/ai-gateway` (Python) has its own
implementation in `auth.py`. Node-only (Rule 34): it uses `node:crypto` and `fetch`.

## Public API

```typescript
import {
  resolveUserIdentity,
  IdentityRejectedError,
  IdentityUnavailableError,
  type BackendIdentity,
  CACHE_MAX_MS,
  CACHE_MAX_ENTRIES,
  clearIdentityCache, // test seam
  identityCacheSize, // test seam
} from '@cos/service-identity';
```

### `resolveUserIdentity(authorization, tokenExpSeconds, now?): Promise<BackendIdentity>`

- `authorization` — the request's `Authorization` header, sent on unchanged
- `tokenExpSeconds` — the verified token's `exp`, or `undefined`; bounds the cache
- `now` — clock in milliseconds, for tests; defaults to `Date.now`
- Resolves `{ tenantId, userId, role }`; rejects `IdentityRejectedError` or `IdentityUnavailableError`

## Dependencies

None at runtime beyond Node 20+ (`node:crypto`, global `fetch`, `AbortSignal.timeout`). It needs the backend's
internal listener to be reachable.

## Configuration

| Variable               | Description                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `BACKEND_INTERNAL_URL` | The backend's internal listener, e.g. `http://backend:3100`. No default: unset = 503 |

Read on every call, not at import. The request timeout is 5 seconds.

## Usage

```typescript
import { IdentityRejectedError, resolveUserIdentity } from '@cos/service-identity';

try {
  const identity = await resolveUserIdentity(request.headers.authorization, verified.exp);
  request.tenantId = identity.tenantId;
} catch (err) {
  if (err instanceof IdentityRejectedError) return reply.status(401).send(/* INVALID_TOKEN */);
  return reply.status(503).send(/* identity unavailable — never fall back to claims */);
}
```

## Build and tests

`dist` is CommonJS (`tsc --project tsconfig.build.json`). credential-service is ESM and resolves the package
through `dist`: mapped to this package's TypeScript source under its ESM jest, every suite loading its auth
plugin failed (measured 2026-09-14). CI therefore builds this package before credential-service's unit and
integration tests (`ci.yml`, mirrored in `scripts/ci/verify-before-push.sh`). file-service maps it to `src`
like its other workspace packages. `pnpm run test:cov` holds 100% lines and branches.
