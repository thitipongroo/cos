# central-prices

NestJS module for ราคากลาง — the Comptroller General's Department central reference prices used for Thai
public-works estimating — as a platform-shared catalog that feeds BOQ lines
([ADR-061](../../../../docs/architecture/adr/061-rakaklang-central-pricing.md)).

## Purpose

- Hold one national price list, versioned by `effective_period`, in `platform.central_price_catalog`.
  Cross-tenant and RLS-exempt; app_user holds `SELECT` only, so no tenant request can write a price.
- Let SYSTEM_ADMIN import it from a CSV or `.xlsx` file, and run a `CentralPriceAdapter` against a
  government source. The only adapter today is the e-GP stub, which reports "not configured"
  (product-owner decision D9, 2026-09-15). File import is the working path.
- Record every import and sync attempt in `platform.central_price_sync_runs`, including failures, for the
  register's API-Sync and Failed-Sync panels.
- Serve active prices to every tenant role, and give the BOQ module the reference price for an item code.

## Public API

```text
GET  /api/v1/admin/central-prices                SYSTEM_ADMIN — register (every status), total, periods
GET  /api/v1/admin/central-prices/sync-status    SYSTEM_ADMIN — adapter + latest run / success / failure
GET  /api/v1/admin/central-prices/template.csv   SYSTEM_ADMIN — the import header row
POST /api/v1/admin/central-prices/import         SYSTEM_ADMIN — multipart: file, effective_period, source_ref?, justification
POST /api/v1/admin/central-prices/sync           SYSTEM_ADMIN — { justification }; runs the adapter once
GET  /api/v1/central-prices                      every tenant role — ACTIVE rows, ?q= &code= &cursor= &limit=
```

Contract: [`docs/api/central-prices.openapi.yaml`](../../../../docs/api/central-prices.openapi.yaml). Errors:
`COS-CPRICE-001` to `-007` in [`docs/api/error-codes.md`](../../../../docs/api/error-codes.md).

Exported provider: `CentralPriceCatalogService` — `searchPublished()` and `findReferencePrice(code)`. It is
the only way another module reads the catalog; `BoqModule` imports this module for it.

### Status

| status   | Condition                                  | Tenants see it | BOQ lines link to it |
| -------- | ------------------------------------------ | -------------- | -------------------- |
| ACTIVE   | `is_active` and `published_at IS NOT NULL` | yes            | yes                  |
| PENDING  | `is_active` and `published_at IS NULL`     | no             | no                   |
| INACTIVE | not `is_active`                            | no             | no                   |

A file import publishes what it writes (`published_at = now()`, `is_active = true`). No endpoint sets a
row PENDING or INACTIVE today.

### The "latest period" rule

A BOQ line with `item_code` X is linked to X's ACTIVE row with the greatest `effective_period` in byte
(`COLLATE "C"`) order, ties broken by the newest `published_at`. Write periods so that text order is time
order — `2568` before `2569`, `2569-01` before `2569-02`. `effective_period` must match
`^[0-9A-Za-z][0-9A-Za-z._/-]{0,31}$`.

### Import rules

- The file name picks the reader (`.csv` or `.xlsx`) and the bytes must agree; CSV must be UTF-8.
- Row 1 is the header. Required columns: `code`, `description`, `unit`, `central_price`. Optional:
  `category`, `currency_code` (default `THB`). Case and surrounding spaces in the header are ignored;
  other columns are ignored.
- `central_price` is a non-negative decimal, at most 15 integer digits and 4 decimal places, parsed
  and normalised with decimal.js and never rounded. `.xlsx` numbers are read as the text the workbook
  stored, so no value passes through a JS float.
- A code repeated in the file is rejected after its first row. Blank rows are skipped. At most 20,000
  data rows; the file at most 5 MiB.
- Upsert by `(code, effective_period)`. Rows of the period that are absent from the file are left alone.

### One transaction per attempt

Catalog rows, the sync run, the `platform.audit_logs` row (`central_prices.import` / `central_prices.sync`,
resource_type `central_price_catalog`, resource_id = run, metadata = justification + counts, `tenant_id` =
the caller's tenant) and, when a row changed, the `platform.central_price_catalog.updated.v1` outbox event
(`tenant_id` = `'platform'`, shared `platform.events` topic) commit together or not at all.

## Dependencies

- `TenantModule` — `TenantPrismaService` for the tenant-context reads
- `createPrismaClient()` (`DATABASE_URL`) — the SYSTEM_ADMIN writes, as TenantService does
- `@cos/financial` — `Decimal` for prices
- `@cos/kafka` — `OutboxPublisher`; `@cos/shared` — `CentralPriceCatalogUpdatedPayload`
- `@fastify/multipart` 10.0.0 (registered in `main.ts` by `shared/http/register-multipart.ts`),
  `csv-parse` 7.0.2, `read-excel-file` 9.3.10

## Configuration

| Variable           | Description                                                    |
| ------------------ | -------------------------------------------------------------- |
| `DATABASE_URL`     | Platform connection for SYSTEM_ADMIN writes                    |
| `APP_DATABASE_URL` | app_user connection for the tenant reads (TenantPrismaService) |

The e-GP adapter has no configuration: there is no verified source to configure (ADR-061).

## Usage

```bash
curl -X POST https://<host>/api/v1/admin/central-prices/import \
  -H "Authorization: Bearer $SYSTEM_ADMIN_TOKEN" \
  -F effective_period=2569 \
  -F "source_ref=กค 0433.2/ว 123" \
  -F "justification=Comptroller General circular for 2569 published" \
  -F file=@ราคากลาง-2569.csv
# → { "run_id": "…", "outcome": "SUCCEEDED", "records_total": 3, "inserted": 2, "updated": 0,
#     "rejected": [ { "row": 4, "reason": "central_price must be a non-negative decimal …" } ] }
```

```typescript
// From another module (inject CentralPriceCatalogService):
const reference = await this.centralPrices.findReferencePrice('STR-001');
// → { price_id, code, unit, central_price: '2450.0000', currency_code: 'THB', effective_period: '2569' } | null
```

## Notes

- Swapping the adapter: bind another `CentralPriceAdapter` class to `CENTRAL_PRICE_ADAPTER` in
  `central-prices.module.ts` and delete `adapters/egp-central-price-adapter.stub.ts` in the same change.
- Tests: unit specs in `__tests__/`; integration in `backend/test/central-prices/`, which runs on the
  Fastify adapter because the import reads the form through the multipart plugin.
