# 048 — Replace WatermelonDB with Drizzle ORM on expo-sqlite for the mobile offline cache

- **Status:** Accepted (product owner, 2026-07-04; option B at the §17.10 gate)
- **Context spec:** `docs/specifications/17-offline-mobile-sync.md` §17.10 (decision record,
  G1/G2 benchmark protocol and measured results)
- **Supersedes:** the WatermelonDB portions of ADR-046 (Expo 56 native wiring)

## Context

WatermelonDB 0.28 required a 7-layer native integration (risk **R-01**, High × High): a pnpm CMake
patch (`patches/@nozbe__watermelondb@0.28.0.patch` — required even against upstream `master`), the
community `@morrowdigital/watermelondb-expo-plugin`, a custom Android JSI config plugin,
`@nozbe/simdjson` pinning, legacy-decorators babel plugin, and **loose class-properties transforms**
— which in turn triggered the Hermes `Event.NONE` crash (facebook/react-native#54732) that broke all
networking and required `patches/react-native@0.85.3.patch`. npm latest has been 0.28.0 for ~1 year.
Meanwhile the app never used WatermelonDB's `synchronize()` — sync is custom (`runDeltaSync` +
`sync_queue`, the latter already on plain expo-sqlite per the Phase 10 ruling).

## Decision

Use **Drizzle ORM on `expo-sqlite`** (first-party, upgrades with the Expo SDK) for all `local_*`
tables. Reactive reads via `useLiveQuery` (`enableChangeListener`); schema via **versioned runtime
DDL** (`PRAGMA user_version`), following the `sync_queue` precedent — no drizzle-kit build tooling.
`sync_queue` unchanged. Fresh DB file (`cos_offline_v2.db`); read caches repopulate via delta sync.

## Measured trade-off (on-device, iPhone 17 sim, Release/Hermes — §17.10)

Drizzle/expo-sqlite is consistently ~2.5× slower relatively (upsert-500 26.9 ms vs 10.2 ms; cold
query-500 12.4 ms vs 5.0 ms; stable at a 10× data probe), but every absolute number is far below
the 200 ms INP budget and capped by §17.7 limits. G2 on the migrated code: upsert 1.02×, warm query
1.07×, cold query 1.20× of the spike envelope — **exit criterion met**.

## Consequences

- Removed: WatermelonDB + simdjson deps, CMake pnpm patch, both config plugins, Android JSI wiring
  (settings.gradle / build.gradle / MainApplication.kt), iOS simdjson pod, legacy-decorators and all
  loose babel transforms (bundle no longer emits `this.NONE = void 0`).
- Kept: `patches/react-native@0.85.3.patch` (upstream #54732 official fix — still guards the
  event-target-shim/fetch path).
- R-01 mitigated at the source; WatermelonDB's warm-read record-cache advantage (§17.10 table) is
  forfeited — acceptable within §17.7 list-size caps.
- Escape hatch: `drizzle-orm/op-sqlite` driver swap if data volume ever exceeds spec ceilings.
