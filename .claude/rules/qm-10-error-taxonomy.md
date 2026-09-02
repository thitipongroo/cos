---
paths:
  - "**/*.filter.ts"
  - "**/*exception*.ts"
  - "docs/api/error-codes.md"
  - "backend/src/shared/**"
---

# QM-10 — Error Taxonomy

Indexed in: `context.md` §QUALITY MANDATES

All errors returned by the API must use this structure:

```json
{
  "error": {
    "code": "COS-{DOMAIN}-{NUMBER}",
    "message": "Human-readable message (English)",
    "messageKey": "i18n.key.for.message",
    "details": {},
    "traceId": "opentelemetry-trace-id",
    "timestamp": "ISO8601"
  }
}
```

Error code registry in `docs/api/error-codes.md`. Format: `COS-AUTH-001`, `COS-PROC-042`, etc.

HTTP status code rules:

- `400` — client input validation error (include field-level details)
- `401` — unauthenticated
- `403` — authenticated but unauthorized (include required permission)
- `404` — resource not found
- `409` — conflict (optimistic lock, duplicate)
- `422` — business rule violation
- `429` — rate limit exceeded (include `Retry-After` header)
- `500` — server error (never expose stack traces to client)
- `503` — service temporarily unavailable (maintenance, circuit breaker open)

Never return `200` with an error body. Never return `500` for client errors.
