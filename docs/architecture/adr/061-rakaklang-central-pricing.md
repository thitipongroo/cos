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

## References

- ADR-057 (gap, post-MVP) · §13.3 (adapter Strategy pattern) · §11 (boq_items, platform schema)
- `docs/research/disruption-strategy.md` / `competitive-landscape.md` (ราคากลาง as a differentiator)
