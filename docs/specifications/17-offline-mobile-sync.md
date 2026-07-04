---
title: 'Offline-first Mobile Sync'
version: '1.4.0'
status: Active
last_updated: '2026-07-05'
authors:
  - thitipongroo
related_docs:
  - 04-tech-stack.md
  - 11-database-schema.md
  - 19-notification-architecture.md
---

# 17. Offline-first Mobile Sync

## Table of Contents

- [17.1 Why Critical](#171-why-critical)
- [17.2 Offline Architecture](#172-offline-architecture)
- [17.3 Conflict Resolution](#173-conflict-resolution)
- [17.4 Entity Offline Scope](#174-entity-offline-scope)
- [17.5 Conflict Resolution Rules per Entity](#175-conflict-resolution-rules-per-entity)
- [17.6 Sync Priority Order](#176-sync-priority-order)
- [17.7 Data Size Limits](#177-data-size-limits)
- [17.8 Expo Native Build Setup (offline DB)](#178-expo-native-build-setup-offline-db)
- [17.9 Delta Sync (server → device pull)](#179-delta-sync-server--device-pull)
- [17.10 Offline DB Layer Decision — WatermelonDB → Drizzle + expo-sqlite](#1710-offline-db-layer-decision--watermelondb--drizzle--expo-sqlite)

---

## 17.1 Why Critical

Construction sites often have :

- Weak internet
- No connectivity
- Temporary outages

Offline capability is mandatory.

---

## 17.2 Offline Architecture

```mermaid
sequenceDiagram
    actor U as Field user
    participant M as Mobile<br/>(Drizzle/expo-sqlite + sync_queue)
    participant S as SyncManager
    participant API as Server /sync
    Note over U,M: Offline — no connectivity
    U->>M: Create / edit (site report, incident, ...)
    M->>M: Local write (sync_status = PENDING)<br/>+ enqueue sync_queue
    Note over M,API: On reconnect / background fetch (>= 15 min)
    S->>M: Drain queue (FIFO, <= 20 per run)
    S->>API: POST /sync/push (queued mutation)
    API-->>S: Applied (server resolves conflict, §17.3)
    S->>M: Mark SYNCED
    Note over S,API: On failure — exponential backoff, max 5 retries
    S--xM: After 5 retries -> review queue / discard (per entity, §17.2 table)
    Note over M,API: Delta pull (server -> device, §17.9)
    M->>API: GET /sync/delta (entity types + lastSyncAt cursor)
    API-->>M: updated[] (upsert) + deleted[] (tombstones)
    M->>M: Apply in one write, mark SYNCED, advance cursor
```

Mobile Local DB :

- **Drizzle ORM on `expo-sqlite`** (WAL mode, `enableChangeListener` for `useLiveQuery` reactive reads) for all main
  business entities (site_reports, issues, local_photos, etc.) — §17.10. Schema via versioned runtime DDL
  (`PRAGMA user_version`), file `cos_offline_v2.db`.
- `sync_queue` infrastructure table uses its own `expo-sqlite` handle (`cos_sync_queue.db`), unchanged.
- Local event queue
- Local media cache (`expo-file-system` for offline photo queue)

Sync Engine :

- Conflict resolution
- Delta sync
- Retry sync (FIFO queue, exponential backoff, max 5 retries)
- Background sync via `expo-background-fetch` + `expo-task-manager` (fires every 15 min minimum —
  OS-imposed limit); processes up to 20 queue items per run; skips if battery saver active / battery < 15%

Max Retry Exhaustion Behavior :

When the sync queue exhausts all 5 retries for a record, the behavior depends on entity type :

| Entity Type           | Behavior After Max Retries                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| Safety incidents      | Moved to tenant admin review queue; push alert sent to PM and Safety Officer; record preserved on device |
| Workforce attendance  | Moved to tenant admin review queue; push alert sent to PM; record preserved on device                    |
| Inspection results    | Moved to tenant admin review queue; push alert sent to PM; record preserved on device                    |
| Task progress updates | Sync attempt discarded; user notified in-app; record preserved on device for manual retry                |
| Site report drafts    | Sync attempt discarded; user notified in-app; record preserved on device                                 |
| Material consumption  | Moved to tenant admin review queue; record preserved on device                                           |
| Equipment usage logs  | Sync attempt discarded; record preserved on device                                                       |

Manual review queue : a server-side queue visible to Tenant Admin where failed sync records
can be reviewed and manually imported. Records are never deleted from the device until
successfully synced or explicitly resolved by an admin.

---

## 17.3 Conflict Resolution

Strategies :

- Last-write-wins (simple)
- Field-level merge
- Human review queue

Depends on entity criticality.

---

## 17.4 Entity Offline Scope

### Offline-capable (full read/write offline)

These entities are critical for daily site operations and must work without connectivity :

- Tasks (progress_percent, status, notes)
- Site reports (daily report drafts)
- Inspections (checklist responses, photos)
- Workforce attendance (check-in/check-out)
- Material consumption records
- Safety checklists and incident reports
- Equipment usage logs

### Online-required (read cache only, no offline write)

These entities require server-side validation before mutation :

- Purchase orders (financial commitment — server approval required)
- Vendor Invoices (AP), Client Billing (AR), AR Receipts, and Payments (financial records — dual-write risk)
- Budget line mutations (cost accounting integrity)
- Vendor master data (shared reference data)
- User permissions and role changes

### Read-only cache (stale-while-revalidate)

These entities are cached for offline reference but not mutated offline :

- Project master data
- BOQ line items
- Room and floor reference data (required for offline task room assignment)
- Drawing files (cached on demand, size-limited)
- Vendor contact directory

---

## 17.5 Conflict Resolution Rules per Entity

| Entity                | Strategy                                                | Reason                                                                                                                                    |
| --------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Task progress_percent | Max-wins                                                | Monotonic — progress never regresses; higher value always wins regardless of write order                                                  |
| Inspection checklist  | Field-level merge                                       | Multiple inspectors may fill different fields                                                                                             |
| Site report           | Last-write-wins on `client_submitted_at` (whole record) | One report per day per submitter; SITE_ENGINEER review if server `modified_at` ≠ client's `last_known_modified_at` (master Phase 6; QM-9) |
| Workforce attendance  | Server wins on check_in                                 | Prevents time manipulation                                                                                                                |
| Safety incident       | Human review queue                                      | Critical record — cannot auto-resolve                                                                                                     |
| Material consumption  | Append-only                                             | Each consumption record is a new row                                                                                                      |

---

## 17.6 Sync Priority Order

When connectivity is restored, the sync queue flushes in this priority order :

1. Safety incidents (critical — escalation may be time-sensitive)
2. Workforce attendance (payroll dependency)
3. Inspection results (QC gate may be blocking downstream tasks)
4. Task progress updates
5. Site report drafts
6. Material consumption logs
7. Equipment usage logs
8. Photo/media uploads (largest payload — deferred last)

---

## 17.7 Data Size Limits

Local cache constraints :

- Max local DB size per device: 500 MB
- Drawing cache: 200 MB maximum, LRU eviction when full
- Photo queue: max 100 photos pending upload; user warned at 80
- Sync batch size: max 500 records per sync cycle to avoid UI blocking

---

## 17.8 Expo Native Build Setup (offline DB)

The offline DB is **Drizzle ORM on `expo-sqlite`** (§17.10) — a first-party Expo module,
so **no extra native wiring is required**: no config plugins, no extra pods, no babel plugins, and no pnpm patches for
the DB layer. The previous WatermelonDB setup (community config plugin, Android JSI wiring, `@nozbe/simdjson` pod,
legacy-decorators + loose-class-properties babel transforms, and the CMake pnpm patch) was removed with the migration.

- **Build / entry:** `app.json` `main` must be `expo-router/entry`; produce the dev client via
  `npx expo run:ios` / `run:android` (or EAS).

---

## 17.9 Delta Sync (server → device pull)

The push path (queued mutations → `POST /sync/push`) is complemented by a **delta pull** that brings
server-side changes down to the device:

- **Caller:** `runDeltaSync()` (`apps/mobile/src/sync/runDeltaSync.ts`) calls `GET /sync/delta` with the registered
  entity types and the last-sync cursor (`syncStore.lastSyncAt`, defaulting to epoch on first run). It applies the
  response's `updated[]` (upsert by server id) and `deleted[]` (remove across tables) through the
  `upsertByKey`/`deleteByKey` seams (db/database.ts), marks applied rows `sync_status = 'SYNCED'`, then advances the cursor
  to the response's `server_timestamp`.
- **Trigger:** invoked from `(app)/_layout` on entering the authenticated app (best-effort; offline is ignored, local
  cache is kept). The previously-unused `DeltaSyncClient` class is superseded by this caller.
- **Entity types applied → local tables** (all six the server's delta registry emits):

  | Server entity type | Local table                   | Schema |
  | ------------------ | ----------------------------- | ------ |
  | `task`             | `local_tasks`                 | v2     |
  | `site_report`      | `local_site_reports`          | v1     |
  | `issue`            | `local_issues`                | v1     |
  | `attendance`       | `local_attendance`            | v2     |
  | `safety`           | `local_incidents`             | v4     |
  | `material`         | `local_material_consumptions` | v4     |

- **Schema version:** `DB_VERSION = 4`. v3→v4 (`migrations.ts`) adds `local_incidents` and
  `local_material_consumptions` as read caches so the delta pull can apply `safety`/`material`.
- **Offline write UI (PO ruling D1–D4 + M1/M2):** `local_incidents` / `local_material_consumptions` are
  surfaced for read/write per §17.4:
  - **Incidents — SAFETY_OFFICER**, dedicated `incidents` tab (`(app)/incidents.tsx`). Create writes a
    `local_incidents` row (`sync_status = PENDING`, reactive list via `useCollection`) **and** enqueues a
    `'safety'` sync_queue item → SyncManager `/sync/push` → `SafetyService.createIncident`.
  - **Material — SITE_ENGINEER**, embedded in the engineer `reports` screen (material is a child of a
    site report; server `createMaterialConsumption(reportId, dto)`). Recording enqueues a `'material'`
    item carrying `report_id` → `/sync/push` → `SiteOpsService.createMaterialConsumption`. No local write
    on create (the delta cache keys on `project_id` while creation keys on `report_id`); the recorded row
    returns via the next delta pull.
  - Known limitation (same as the issues screen): `PENDING`→`SYNCED` reconciliation and delta-dedup of
    locally-created rows are not yet wired.
- **Deletion source:** `deleted[]` is read from `platform.sync_tombstones`; per-entity delete→tombstone
  wiring is deferred (today the list is empty until each entity records tombstones).

---

## 17.10 Offline DB Layer Decision — WatermelonDB → Drizzle + expo-sqlite

### Proposal

Replace **WatermelonDB** with **Drizzle ORM on `expo-sqlite`** for the offline entity cache (`local_*` tables).
The `sync_queue` table already uses `expo-sqlite` directly and is unchanged.

### Rationale (verified 2026-07-04)

1. **Unused core feature** — the app does not call WatermelonDB's `synchronize()`; sync is custom
   (`runDeltaSync.ts` + `sync_queue`, §17.9). WatermelonDB serves only as a reactive cache, which
   `drizzle-orm/expo-sqlite` `useLiveQuery` replaces directly.
2. **Maintenance burden is real and upstream-unresolved** — the pnpm CMake patch
   (`patches/@nozbe__watermelondb@0.28.0.patch`) is required even against WatermelonDB `master`;
   npm latest is 0.28.0 (~1 year old); the Expo config plugin is community-maintained (§17.8).
3. **Single storage engine** — `expo-sqlite` is already a production dependency (`sync_queue`);
   consolidation removes the dual-engine setup and adds **zero new native dependencies**.
   `expo-sqlite` is Expo first-party and upgrades in lockstep with the SDK.
4. **TypeScript-first** — Drizzle schema is plain TS (replaces decorator model classes + the
   `@babel/plugin-proposal-decorators` requirement); `drizzle-kit` replaces hand-written
   migrations (current `DB_VERSION = 4`).
5. **Cheap escape hatch** — Drizzle also supports `op-sqlite` (`drizzle-orm/op-sqlite`); if data
   volume ever exceeds §17.7 ceilings, the driver swaps beneath the ORM without schema/query rewrites.
   Industry pattern (Notion offline 2025) is likewise "plain SQLite + owned sync layer", which
   §17.2/§17.9 already implement.

### Migration scope (verified against `apps/mobile`)

| Item                                                                                                                     | Change                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| 9 model classes (`src/db/models/`)                                                                                       | → Drizzle schema tables (incl. `local_photos` — metadata-only, file stays in `expo-file-system`) |
| `useCollection` hook (8 screens)                                                                                         | → `useLiveQuery`                                                                                 |
| Write paths (7 files incl. `runDeltaSync.ts`, `api/projects.ts`)                                                         | → Drizzle inserts/updates                                                                        |
| `schema.ts` + `migrations.ts` (v1–v4)                                                                                    | → versioned runtime DDL (`PRAGMA user_version`) — see implementation note under DECISION         |
| `sync_queue` (`sync-queue.ts`)                                                                                           | **unchanged** (already expo-sqlite)                                                              |
| §17.8 native setup (config plugin, `@nozbe/simdjson` pin, decorators babel plugin), CMake pnpm patch                     | **removed entirely**                                                                             |
| Sync protocol (§17.2/§17.9), conflict rules (§17.3/§17.5), priority (§17.6), limits (§17.7), Detox e2e scenarios (§30.5) | **unchanged** — e2e suite doubles as the behavioral regression gate                              |

### Benchmark protocol (two gates, relative-only)

No absolute thresholds are set — no data exists to justify one. Both gates compare against the
**current WatermelonDB implementation as baseline**, same device/simulator, same dataset:

- **G1 — pre-migration spike (input to THIS gate):** throwaway Drizzle/expo-sqlite table; measure
  **batch-500 upsert** (the §17.7 sync-batch cap) and a **per-project list query** vs the same
  operations on an existing WatermelonDB table. Cheap: expo-sqlite is already installed; nothing
  is migrated. If Drizzle/expo-sqlite is materially slower than baseline → STOP, escalate.
- **G2 — post-migration regression (exit criterion):** repeat the same two measurements on the
  real migrated code before merge. Criterion : **parity or better** (beyond measurement noise);
  any regression → AWAITING_DECISION (product owner).

> **G1 RESULT (2026-07-04 — iPhone 17 simulator, Release/Hermes, harness
> `apps/mobile/e2e/benchmark.spec.ts` + `src/app/e2e/benchmark.tsx`):**
>
> | Engine                  | upsert-500 (3 runs, median)      | query-500 (3 runs, median)   |
> | ----------------------- | -------------------------------- | ---------------------------- |
> | WatermelonDB (baseline) | [13.2, 10.2, 9.8] → **10.2 ms**  | [0.5, 0.3, 0.3] → **0.3 ms** |
> | Drizzle + expo-sqlite   | [29.3, 26.7, 26.9] → **26.9 ms** | [9.5, 5.8, 5.7] → **5.8 ms** |
> | Ratio DZ/WM             | **2.63× slower**                 | **21.2× slower**             |
>
> **Fails relative parity → migration STOPPED at G1; escalated to product owner** (per this
> protocol).
>
> **Cold-read follow-up (same day, option C — seed → kill process → relaunch → query first):**
> the 21.2× figure was confirmed to be cache-confounded. With both engines reading disk:
>
> | Measure                                  | WatermelonDB | Drizzle + expo-sqlite | Ratio                                          |
> | ---------------------------------------- | ------------ | --------------------- | ---------------------------------------------- |
> | query-500 COLD (first op of new process) | 5.0 ms       | 12.4 ms               | **2.45×**                                      |
> | query-500 WARM (2nd/3rd read)            | 0.5–1.6 ms   | 6.1–6.5 ms            | WM record-cache advantage is real for re-reads |
>
> Complete picture: Drizzle/expo-sqlite is consistently ~**2.5× slower relatively** (upsert 2.63×,
> cold query 2.45×); absolute deltas at §17.7 ceilings are +16.7 ms per 500-record background sync
> apply and +7.4 ms per cold 500-row list read — far below the 200 ms INP budget (QM-6).
>
> **10× headroom probe (same day, n=5000 — exceeds the §17.7 cap by 10×, Drizzle inserts chunked
> at 2,000 rows/statement inside one transaction due to SQLite's 32,766 bind-param ceiling):**
>
> | Measure (n=5000) | WatermelonDB | Drizzle + expo-sqlite | Ratio | Scale vs n=500                     |
> | ---------------- | ------------ | --------------------- | ----- | ---------------------------------- |
> | upsert-5000      | 98.9 ms      | 280.0 ms              | 2.83× | WM 9.7× / DZ 10.4× — both linear   |
> | query-5000 COLD  | 28.4 ms      | 70.6 ms               | 2.49× | WM 5.7× / DZ 5.7× — both sublinear |
> | query-5000 WARM  | 2.5–3.5 ms   | 58.6–59.7 ms          | —     | WM record-cache advantage persists |
>
> **Scaling verdict:** both engines scale linearly; the relative gap is stable (~2.5–2.8×) and does
> NOT widen at 10× — no cliff on either side. Worst absolute Drizzle numbers at 10× the spec cap:
> 280 ms per background batch apply, 70.6 ms per cold list read, ~59 ms per warm re-read of 5,000
> rows (the warm re-read is the only measure where WatermelonDB's cache advantage could be
> user-facing; §17.7 caps realistic list sizes well below this).
>
> **DECISION (product owner, 2026-07-04): option B.** The G1/G2 criterion is amended from
> relative parity to the **measured absolute envelope**: the migrated code's on-device numbers
> (same harness, same simulator) must stay within noise of the spike figures above —
> upsert-500 ≈ 27 ms, cold query-500 ≈ 12 ms (and at the 10× probe: upsert-5000 ≈ 280 ms,
> cold query-5000 ≈ 71 ms). Exceeding the envelope materially → AWAITING_DECISION again.
> Migration proceeds. Implementation note: local schema/migrations use **versioned runtime DDL**
> (`CREATE TABLE IF NOT EXISTS` + `PRAGMA user_version`), following the existing `sync_queue`
> precedent, instead of drizzle-kit build tooling.
>
> **MIGRATION LANDED (2026-07-05) — G2 exit criterion MET.** On-device (same harness/simulator):
> upsert-500 27.5 ms (**1.02×** of envelope), warm query-500 6.2 ms (**1.07×**), cold query-500
> 14.9 ms (**1.20×**). End-to-end verified: delta pull populates the Drizzle tables and the
> 21-screen capture renders live data (Home issue count, Issues list SYNCED badges). tsc clean;
> 16 jest suites / 93 tests green (sync/ at 100% coverage); the JS bundle contains zero
> WatermelonDB references and, with the loose babel transforms gone, no longer emits
> `this.NONE = void 0` (ADR-048). `patches/react-native@0.85.3.patch` retained (upstream #54732).
>
> **Native rebuild (2026-07-05):** iOS verified locally — `pod install` regenerated the Pods with
> the WatermelonDB/simdjson pods removed (Podfile.lock −13 lines, 0 refs), and a full
> `xcodebuild -configuration Release -sdk iphonesimulator` → **BUILD SUCCEEDED**; the linked `COS`
> binary shows no WatermelonDB/simdjson (`otool -L`) and the embedded Hermes bundle has 0 watermelon
> strings. Android could **not** be built locally: the toolchain here is JDK 25 (project targets
> JDK 17) and Gradle 9.3.1 fails at plugin init with `JvmVendorSpec.IBM_SEMERU` (a removed Gradle
> API) — proven pre-existing/environmental by an isolation test (the unmodified tree with the
> WatermelonDB Gradle wiring restored fails identically in 1 s, before the edits are evaluated). The
> Android source edits (MainApplication.kt, settings.gradle, build.gradle) are clean deletions with
> 0 `IBM_SEMERU` references; Android native build defers to a JDK-17 CI runner.

### Post-approval propagation checklist (completed 2026-07-05, ADR-048)

- Rewrite §17.2 / §17.8 / §17.9 bodies + References table (drop [WatermelonDB], add Drizzle)
- New ADR in `docs/architecture/adr/` (next number after 046)
- Specs referencing WatermelonDB : `00-glossary`, `03-system-design`, `04-tech-stack`,
  `05-security-compliance`, `30-testing-strategy`
- Context chain : `context/00_master` (R-01 mitigation → executed; Phase 10 refs),
  `context/01`, `context/02`, `context/README`, then `context.md` (Rule 37)
- Remove `patches/@nozbe__watermelondb@0.28.0.patch`, `plugins/withWatermelonAndroidJSIFix.js`,
  `@nozbe/simdjson` direct dep, decorators babel plugin

---

## References

| ID            | Title                                                              | Source                                                                                        |
| ------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| [IEEE 830]    | IEEE Recommended Practice for Software Requirements Specifications | IEEE Std 830-1998                                                                             |
| [CRDT]        | Conflict-Free Replicated Data Types                                | Shapiro et al., INRIA Research Report RR-7687, 2011                                           |
| [Drizzle]     | Drizzle ORM — Expo SQLite driver                                   | [drizzle: Expo SQLite](https://orm.drizzle.team/docs/connect-expo-sqlite)                     |
| [IndexedDB]   | Indexed Database API 3.0                                           | W3C Recommendation — [w3.org/TR/IndexedDB](https://www.w3.org/TR/IndexedDB/)                  |
| [Expo SQLite] | Expo SQLite Documentation                                          | [docs.expo.dev/versions/latest/sdk/sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/) |
| [JWT-RFC]     | JSON Web Token (JWT)                                               | RFC 7519                                                                                      |

> 📎 See also: [04-tech-stack](04-tech-stack.md) · [11-database-schema](11-database-schema.md) · [19-notification-architecture](19-notification-architecture.md)
