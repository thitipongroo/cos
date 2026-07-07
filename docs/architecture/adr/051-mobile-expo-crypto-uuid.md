# 051: expo-crypto for client-generated UUIDs on mobile (offline sync idempotency)

**Date:** 2026-07-07
**Status:** Accepted
**Deciders:** Product owner (thitipongroo), engineering
**Tags:** mobile, data

---

## Context

Offline-created records that sync via `POST /api/v1/sync/push` must carry a **client-generated UUID**
so the server can create the row idempotently. The site-report sync contract (`SyncItemDto.client_id`,
`backend/src/modules/site-ops/dto/sync-site-reports.dto.ts`) validates this as `@IsUUID`, and the push
handler maps `client_id → report_id` (`sync.service.ts`).

The mobile app had **no UUID generator**: `newLocalId()` (`apps/mobile/src/db/database.ts`) returns a
`base36-counter-random` string (device-local uniqueness only — not RFC-4122), and there is no
`expo-crypto` / `uuid` / `nanoid` dependency. As a result, `report.tsx` never enqueued a `site_report`
sync item — locally-created daily reports were written to `local_site_reports` (PENDING) but **never
pushed to the server** (gap surfaced while implementing G-M5a/G-M5b, 2026-07-07). The same class of gap
existed for offline inspections (fixed in G-M3a).

## Decision

Add **`expo-crypto`** (Expo SDK-56 bundled version `~56.0.4`, from `expo/bundledNativeModules.json`) as a
mobile dependency and use `Crypto.randomUUID()` to mint the client-generated UUID for offline-created
entities that sync through `/sync/push` with a `@IsUUID` `client_id` (starting with site reports).

`newLocalId()` remains the **local SQLite row primary key** (device-local); the crypto UUID is the
**server identity / idempotency key** stored in the row's `report_id` and sent as the sync `client_id`.

## Rationale

- The sync contract requires a real UUID; a device-local id is not valid.
- `expo-crypto.randomUUID()` is the first-party, SDK-pinned, cryptographically-strong RFC-4122 generator —
  preferred over a hand-rolled `Math.random` UUIDv4 (avoids weak-RNG and correctness pitfalls) and over
  loosening the server `@IsUUID` contract.
- Version is pinned from the SDK's `bundledNativeModules.json`, not guessed, keeping native compatibility.

Alternatives rejected: hand-rolled `Math.random` UUIDv4 (weaker RNG, no dep but lower quality);
loosening `SyncItemDto.client_id` validation (weakens the server contract for all clients).

## Consequences

### Positive

- Offline-created site reports (and future offline-create entities) can sync correctly via `/sync/push`.
- Standard, SDK-compatible UUID generation available app-wide.

### Negative

- One additional Expo native module (`expo-crypto`) — requires a dev-client / EAS rebuild.

### Neutral

- `newLocalId()` keeps its role as the local row PK; only the server idempotency key changes to a UUID.

## References

- `backend/src/modules/site-ops/dto/sync-site-reports.dto.ts` (`SyncItemDto.client_id` `@IsUUID`)
- `backend/src/modules/sync/sync.service.ts` (`push` → `client_id → report_id`)
- ADR-048 (Drizzle/expo-sqlite offline DB), ADR-046 (Expo 56)
- Gaps G-M5a / G-M5b (functional audit 2026-07-07)
