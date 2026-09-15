# 61. ราคากลาง (Comptroller-General central pricing) as a BOQ price source — post-MVP

Date: 2026-07-20

## Status

Accepted

## Context

ADR-057 recorded ราคากลาง (the Comptroller General's Department central reference pricing used for Thai
public-works estimating) as a post-MVP gap — absent from the entire spec. The product owner requested the
full design. It remains **post-MVP**.

Product-owner decisions (2026-07-20):

- **Data source:** BOTH — manual/file import **and** an API adapter to กรมบัญชีกลาง / e-GP.
- **Storage:** Platform-level shared reference (central prices are national/public).
- **BOQ feed:** BOTH — `reference_price` + variance **and** auto-populate the BOQ price (editable).
- **Host:** BOQ service (`boq` schema, Phase 4).

## Decision

### Data model

**`platform.central_price_catalog`** (platform schema — cross-tenant shared, RLS-exempt): `price_id`,
`code`, `description`, `unit`, `central_price` DECIMAL(19,4), `currency_code`, `effective_period`
(year/version), `source` ENUM(`MANUAL_IMPORT` / `GOV_API`), `source_ref`, `published_at`, `is_active`.
Tenants read-only; SYSTEM_ADMIN manages.

**`boq_items`** (boq schema) gains: `central_price_id` (nullable FK → central_price_catalog),
`reference_price` DECIMAL(19,4) (snapshot at line creation), `price_variance` DECIMAL(19,4) =
`unit_cost − reference_price`.

### Ingestion (both paths)

- **Manual/file import:** SYSTEM_ADMIN uploads CSV/Excel → `central_price_catalog`, versioned by
  `effective_period`.
- **API adapter:** `CentralPriceAdapter` (Strategy pattern, §13.3, same shape as the ERP/fintech adapters)
  pulls from กรมบัญชีกลาง / e-GP. ⚠️ **Public-API availability is unverified** — the adapter is the seam;
  it is wired when a usable source exists. Manual import always works meanwhile.

### BOQ feed (both modes)

- **Mode A — reference + variance:** `reference_price` is looked up by `code`; the UI shows the variance
  against the estimator's entered `unit_cost`.
- **Mode B — auto-populate:** the BOQ line's `unit_cost` is pre-filled from the central price and remains
  editable.

### API (§14)

- `POST /api/v1/admin/central-prices/import` — SYSTEM_ADMIN file import
- `GET /api/v1/central-prices` — lookup by code/description (tenant read)
- `GET /api/v1/boq/projects/{id}/price-variance` — BOQ-vs-central variance report

### RBAC (§6)

`central_price_catalog` is **platform-managed** (SYSTEM_ADMIN import/API sync); all tenant roles are
read-only. BOQ `reference_price` / variance follow existing BOQ permissions.

### Events (§16)

`CentralPriceCatalogUpdated` (on import or API sync).

### UX (§20)

- `/admin/central-prices` — SYSTEM_ADMIN import + catalog browse
- BOQ editor surfaces `reference_price`, variance, and the auto-populate action; a project BOQ-vs-central
  variance view

## Consequences

### Positive

- A credible, localised BOQ pricing anchor that BUILK/KANNA/ANDPAD do not offer (see `docs/research/`).
- Platform-shared catalog = one national dataset, not per-tenant duplication.

### Negative / open

- **กรมบัญชีกลาง / e-GP public-API availability is unverified** — until confirmed, only the manual-import
  path is guaranteed; the adapter is a stub seam (§13.3 pattern).
- Item-code mapping between a tenant's BOQ codes and the central catalog codes is a build-time concern.
- Pairs naturally with the e-GP public-procurement integration (recorded separately).

### Neutral

- **Remains post-MVP.**

## Amendment — 2026-09-15: built in full, with what the build added and what it left outstanding

**Decided by:** Product Owner, 2026-09-15 (plan revision R17, decisions D8, D9, D12)

D8 built this record in full in one round. Where the build needed something the Decision above does not
say, it is recorded here rather than left to be read out of the code.

### Additions to the data model

- **`central_price_catalog.category`** (nullable `TEXT`). Not in the Decision. The Stitch "Central Price
  Register" screen draws a "หมวดหมู่งาน" (work category) column, and an imported file carries one. Free
  text: no category vocabulary is specified anywhere. The table also carries `created_at` / `updated_at`,
  and `source` is held as a `CHECK (source IN ('MANUAL_IMPORT', 'GOV_API'))` rather than a PostgreSQL enum
  type, like `boq_versions.status`.
- **`platform.central_price_sync_runs`**. Not in the Decision. One row per import or sync attempt —
  `kind` (FILE_IMPORT / GOV_API), `source_name`, `effective_period`, `started_at`, `finished_at`,
  `outcome` (SUCCEEDED / FAILED / NOT_CONFIGURED), `records_total` / `_inserted` / `_updated` /
  `_rejected`, `error_code`, `error_message`, `actor_id` — written when the attempt finishes, failures
  included. Without it the register's API-Sync and Failed-Sync panels could only show invented state.
- **Privileges.** app_user holds `SELECT` only on both tables. "Tenants read-only" is therefore enforced by
  the database, not by application code alone; SYSTEM_ADMIN writes run on the platform connection. The
  migration REVOKEs first, because the schema's default privileges would otherwise grant app_user
  INSERT/UPDATE/DELETE on every new `platform` table.
- **`boq_items.central_price_id`** references the catalog `ON DELETE RESTRICT`: a price a BOQ line cites
  cannot be deleted from under it.

Migration `20260915000002_central_price_catalog`, rollback
`backend/prisma/rollbacks/20260915000002_central_price_catalog.rollback.sql`.

### Rules the Decision left open

- **Publishing.** A file import publishes what it writes: `published_at = now()`, `is_active = true`, on
  insert and on update. `published_at IS NULL` ("Pending") exists for rows written another way; no
  endpoint sets a row pending or inactive this round.
- **Which price a BOQ line takes.** The code's ACTIVE row (active and published) with the greatest
  `effective_period` in byte order, ties to the newest `published_at`. Periods are text (`year/version`),
  so they must be written so that text order is time order (`2568` < `2569`); `effective_period` is
  restricted to `^[0-9A-Za-z][0-9A-Za-z._/-]{0,31}$`. `published_at` is not compared first, because a
  back-filled older period imported today would then displace the current one.
- **Currency.** A central price in a currency other than the line's is not linked in Mode A, and refuses
  Mode B: a variance across currencies is not a number anyone can act on.
- **Snapshot on update.** A linked line keeps its `reference_price`; only `price_variance` is recomputed
  when `unit_cost` changes. An unlinked line is looked up again on its next edit. Mode B re-takes the
  snapshot. A version copy carries the three columns unchanged.
- **Import.** Upsert by `(code, effective_period)`; rows of the period absent from the file are left
  alone. A price with more than four decimals is rejected, never rounded. A code repeated in one file is
  rejected after its first row. A file where every row fails records a FAILED run; a file that cannot be
  read as a whole records a FAILED run and answers 422.
- **Event.** `CentralPriceCatalogUpdated` is `platform.central_price_catalog.updated.v1`, emitted through
  the outbox in the import's or sync's transaction only when a catalog row changed. It is platform-scope:
  envelope `tenant_id` is the `'platform'` sentinel and it rides the shared `platform.events` topic. The
  audit row carries the caller's own tenant id, which audit_logs' row security requires.

### Dependencies chosen (2026-09-15)

| Package              | Version (pinned) | Why                                                                                                                                                                                            |
| -------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@fastify/multipart` | 10.0.0           | The major `services/file-service` already uses, and the version the lockfile already resolved. Registered once in `main.ts` with the import form's limits (5 MiB file, one file, three fields) |
| `read-excel-file`    | 9.3.10           | Reads `.xlsx` only, returns numbers as their stored text (so prices never pass through a float), MIT, released 2026-08. Audited clean with its four dependencies                               |
| `csv-parse`          | 7.0.2            | No dependencies, released 2026-08, audited clean                                                                                                                                               |

Not chosen: the npm `xlsx` (SheetJS) package, whose npm releases carry unpatched advisories; `exceljs`
4.4.0, whose last release was 2024-12 and which pulls `uuid` < 11.1.1 (GHSA-w5hq-g745-h8pq, flagged by
`npm audit`). Legacy `.xls` is not supported. An `.xlsx` is decompressed in memory and the 5 MiB cap
bounds only its compressed size; the route is SYSTEM_ADMIN-only, which is the control relied on — an
**open risk**, not a solved one.

### The adapter: a stub seam, reporting honestly (D9)

`CentralPriceAdapter` (Strategy, §13.3) has one implementation, `EgpCentralPriceAdapter`, a stub:
`isConfigured()` is false and `fetch()` returns NOT_CONFIGURED without any network call, because
กรมบัญชีกลาง / e-GP public-API availability is still unverified. `POST /api/v1/admin/central-prices/sync`
runs it and records a NOT_CONFIGURED run. This departs from §32.9 Type A, which has a non-critical stub
throw: D9 decided the seam reports "not configured", and a recorded NOT_CONFIGURED run writes nothing, so
it cannot be mistaken for "the upstream had no prices" — the silent-corruption case §32.9 guards against.
File import remains the working path.

### API as built

`GET /api/v1/admin/central-prices`, `GET …/sync-status`, `GET …/template.csv`,
`POST …/import`, `POST …/sync` (SYSTEM_ADMIN); `GET /api/v1/central-prices` (every tenant role, ACTIVE rows);
`GET /api/v1/boq/projects/{projectId}/price-variance` (BOQ read roles). Contracts in
`docs/api/central-prices.openapi.yaml` and `docs/api/boq.openapi.yaml`; errors `COS-CPRICE-001`–`007`.

### Outstanding

**BOQ editor surfacing and variance view outstanding: no web BOQ item editor and no Stitch screen exist
(product-owner decision 2026-09-15).** The UX line above — "BOQ editor surfaces `reference_price`,
variance, and the auto-populate action; a project BOQ-vs-central variance view" — is not built. D12 stops
the BOQ side at the API this round.

## References

- ADR-057 (gap, post-MVP) · §13.3 (adapter Strategy pattern) · §11 (boq_items, platform schema)
- §32.9 (integration stub pattern) · ADR-008 (RLS) · ADR-094 (durable event outbox)
- `docs/research/disruption-strategy.md` / `competitive-landscape.md` (ราคากลาง as a differentiator)
