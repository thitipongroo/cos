---
title: Construction OS — API Contracts
last_updated: 2026-09-03
---

# Construction OS — API Contracts

OpenAPI 3.1 specifications, one file per service, plus the two cross-cutting registries every API
change touches. This is an **index of what is committed here** — the authoritative catalogue of which
services get a spec is [`specifications/14-api-architecture.md` §14.3](../specifications/14-api-architecture.md).

**Convention (QM-2):** `docs/api/{service}.openapi.yaml` — one file per service, never one combined
file. Every endpoint carries the `/api/v1/` prefix (NestJS `setGlobalPrefix('api/v1')`, `backend/src/main.ts`)
**except credential-service**, which mounts at the root — see the third note below.
A breaking change (removing/renaming a field, changing a field's type, changing a URL, changing the
auth mechanism) requires a new version; old versions stay functional for ≥ 12 months.

## Specs

| Domain (§14.3)     | File                                                             | `info.title`                              | `info.version` |
| ------------------ | ---------------------------------------------------------------- | ----------------------------------------- | -------------- |
| Authentication     | [auth.openapi.yaml](auth.openapi.yaml)                           | Construction OS — Auth API                | `1.0.0`        |
| Tenant Management  | [tenant.openapi.yaml](tenant.openapi.yaml)                       | Construction OS — Tenant API              | `1.0.0`        |
| Projects           | [project.openapi.yaml](project.openapi.yaml)                     | Construction OS — Project Service API     | `1.0.0`        |
| Bill of Quantities | [boq.openapi.yaml](boq.openapi.yaml)                             | Construction OS — BOQ Service API         | `1.0.0`        |
| Procurement        | [procurement.openapi.yaml](procurement.openapi.yaml)             | Construction OS — Procurement Service API | `1.0.0`        |
| Financial          | [finance.openapi.yaml](finance.openapi.yaml)                     | Finance Service API                       | `1.0.0`        |
| Site               | [site-ops.openapi.yaml](site-ops.openapi.yaml)                   | Construction OS — Site Operations API     | `v1`           |
| Safety             | [safety.openapi.yaml](safety.openapi.yaml)                       | Construction OS — Safety API              | `1.0.0`        |
| Files              | [file.openapi.yaml](file.openapi.yaml)                           | Construction OS — File Service            | `1.0.0`        |
| Notifications      | [notification.openapi.yaml](notification.openapi.yaml)           | Notification Service API                  | `1.0.0`        |
| Equipment          | [equipment.openapi.yaml](equipment.openapi.yaml)                 | Construction OS — Equipment API           | `v1`           |
| Workforce          | [workforce.openapi.yaml](workforce.openapi.yaml)                 | Construction OS — Workforce API           | `v1`           |
| CRM                | [crm.openapi.yaml](crm.openapi.yaml)                             | Construction OS — CRM API                 | `1.0.0`        |
| AI                 | [ai.openapi.yaml](ai.openapi.yaml)                               | Construction OS — AI API                  | `v1`           |
| Knowledge Graph    | [graph.openapi.yaml](graph.openapi.yaml)                         | Construction OS — Graph API               | `1.0.0`        |
| Analytics          | [analytics.openapi.yaml](analytics.openapi.yaml)                 | Construction OS — Analytics API           | `1.0.0`        |
| Vendor Portal      | [vendor.openapi.yaml](vendor.openapi.yaml)                       | Construction OS — Vendor Portal API       | `v1`           |
| Digital Twin       | [digital-twin.openapi.yaml](digital-twin.openapi.yaml)           | Construction OS — Digital Twin API        | `v1`           |
| Offline Sync       | [sync.openapi.yaml](sync.openapi.yaml)                           | Construction OS — Offline Sync API        | `v1`           |
| Master Data        | [master-data.openapi.yaml](master-data.openapi.yaml)             | Construction OS — Master Data API         | `v1`           |
| Geo                | [geo.openapi.yaml](geo.openapi.yaml)                             | Construction OS — Geo API                 | `v1`           |
| Platform           | [platform.openapi.yaml](platform.openapi.yaml)                   | Construction OS — Platform API            | `1.0.0`        |
| Credentials        | [credential.openapi.yaml](credential.openapi.yaml)               | Construction OS — Credential Service API  | `1.0.0`        |
| — (see below)      | [platform-webhooks.openapi.yaml](platform-webhooks.openapi.yaml) | Construction OS — Platform Webhooks API   | `1.0.0`        |

24 specs. Three notes, all differences between this folder and §14.3 rather than errors in either —
recorded here so nobody has to re-derive them:

- **`digital-twin`** is marked in §14.3 as _"Post-MVP — Phase 24 … (not created before Phase 24
  begins)"_, yet the file is committed. Treat §14.3 as the authority on when the endpoints are
  expected to work; the committed file is the contract, not a statement that Phase 24 has shipped.
- **`platform-webhooks`** is not in the §14.3 table at all. Its authoritative definition is
  [`34-enterprise-tenant-provisioning.md`](../specifications/34-enterprise-tenant-provisioning.md)
  (§ "CRM webhook: `docs/api/platform-webhooks.openapi.yaml`"), with the HMAC-SHA256 signature
  requirement in [`05-security-compliance.md` §5.9.3](../specifications/05-security-compliance.md).
- **`credential`** carries **no `/api/v1` prefix**. The service mounts its routes at the root
  (`services/credential-service/src/main.ts`) because Kong owns external routing, so the document's
  `servers.url` is `/`. It is the one standing exception to QM-2's version-prefix rule; §14.3 now
  carries the row and §5.9.8 is authoritative on which of its routes are edge-reachable.

`info.version` is spelled two ways across the set (`1.0.0` and `v1`). The values above are read from
the files as committed; the URL version that actually governs compatibility is the `/api/v1/` path
prefix, not this field.

## Registries

| File                                               | What it is                                                                                                  |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [error-codes.md](error-codes.md)                   | Construction OS — API Error Code Registry (QM-10). Every `COS-{DOMAIN}-{NNN}` code an endpoint may return.  |
| [deprecation-schedule.md](deprecation-schedule.md) | Construction OS — API Deprecation Schedule. Sunset dates + the tenant notification log (≥ 90 days' notice). |

## When you change an API

1. Update the service's `.openapi.yaml` in the same PR as the code — **CI fails if the document is
   older than the module it describes** (`scripts/readiness/check-openapi-freshness.sh`, wired into
   the `lint` job on 2026-08-24). It compares git COMMIT timestamps, not mtimes, so a fresh clone
   gives the same answer as a working tree.

   This line claimed the same thing before 2026-08-24 and was not true: the script existed, worked,
   and ran in no workflow. Run then, it reported 12 of 12 documents stale, and a route-level
   comparison found **62 of 276 controller routes carried by no document at all** — every `/sync/*`
   endpoint the mobile client depends on, `/geo/reverse`, all of `/materials`, seven contract
   endpoints. All 62 were written that day and the gate turned on behind them.

2. Add the route to the document in the same PR — **CI fails if a route this repository serves
   appears in no OpenAPI document** (`scripts/ci/check-route-coverage.mjs`, `pnpm run lint:routes`,
   wired into the `lint` job on 2026-09-03). It reads NestJS controllers, Fastify services and
   FastAPI services alike.

   The `lint` step above claimed this rule in its comment from 2026-08-24 and no script enforced it:
   freshness compares timestamps and cannot see a route that is in no document. A second audit on
   2026-09-03 found seven such routes and one service — credential-service — with no document at
   all, four months after the first audit found 62. Two harvests, and nothing enforcing the rule in
   between.

3. New error code → add it to [error-codes.md](error-codes.md).
4. Breaking change → new version, plus a `BREAKING CHANGE:` entry in the root `CHANGELOG.md`.
5. Sunsetting a version → record the date in [deprecation-schedule.md](deprecation-schedule.md).

> 📎 [`specifications/14-api-architecture.md`](../specifications/14-api-architecture.md) — API
> architecture, the canonical service→spec table (§14.3), and the versioning policy (§14.4).
