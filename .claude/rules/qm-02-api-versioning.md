---
paths:
  - "backend/src/**/*.controller.ts"
  - "docs/api/*.openapi.yaml"
  - "backend/src/main.ts"
  - "services/*/routes/**"
  - "services/ai-gateway/**/*.py"
---

# QM-2 — API Versioning

Indexed in: `context.md` §QUALITY MANDATES

- Every HTTP endpoint must include a version prefix: `/api/v1/`, `/api/v2/`, etc. (NestJS global prefix `api/v1` — source: `backend/src/main.ts`)
- Version from day 1 — retrofitting is 10× more expensive
- Breaking changes require a new version. Breaking change = any of:
  - removing or renaming a field
  - changing a field's type
  - changing an endpoint's URL
  - changing an authentication mechanism
- Non-breaking additions (new optional fields, new endpoints) do not require a version bump
- Old versions must remain functional for ≥ **12 months** after a new version is published (minimum deprecation notice before version sunset — source: spec §14.4)
- OpenAPI 3.1 spec must be generated per service under `docs/api/{service}.openapi.yaml` (e.g., `docs/api/auth.openapi.yaml`) — one file per service, not one combined file
- When deprecating an API version: notify tenants via email + in-app banner ≥ 90 days before sunset; record sunset date in `docs/api/deprecation-schedule.md`
