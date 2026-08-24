---
title: Construction OS — Mobile App
last_updated: 2026-08-07
---

# Mobile App — `apps/mobile/`

Expo / React Native, **smartphone only**, offline-first, all roles. Tablets and laptops use
`apps/web/` instead — there is no overlap; each device has exactly one platform.

## It is a separate pnpm workspace

`pnpm-workspace.yaml` at the repo root excludes it (`!apps/mobile`). React Native + Expo + Metro +
CocoaPods assume a flat, hoisted `node_modules`; pnpm's isolated linker breaks Metro's resolution of
transitive `expo-*` / `@react-native/*` packages, and pnpm cannot scope hoisting to one package
inside a workspace.

So `apps/mobile` is its own workspace root with `nodeLinker: hoisted` set in
**`apps/mobile/pnpm-workspace.yaml`** — pnpm 10/11 reads the linker setting from there, _not_ from
`.npmrc` (the `.npmrc` in that folder only documents it). It consumes `@cos/types` as a `file:`
dependency.

```bash
cd apps/mobile && pnpm install
```

Nothing in `turbo.json` or the main CI matrix references `@cos/mobile`; mobile lint, type-check and
tests run as their own CI job. **This exclusion is required, not a deviation.**

`tsconfig.json` extends `expo/tsconfig.base`, **not** the root `tsconfig.base.json` (the root base
uses `"module": "CommonJS"`, which Metro cannot consume). Only mobile-safe `@cos/*` paths are mapped:
`types`, `financial`, `validation`, `rbac`, `shared` — never `logger`, `tracing`, `config` or
`database`, which are Node-only.

## Offline storage

**Drizzle ORM on `expo-sqlite`** (`cos_offline_v2.db`, WAL mode, `enableChangeListener` for
`useLiveQuery` reactive reads) for every main business entity. `sync_queue` keeps its own expo-sqlite
handle (`cos_sync_queue.db`).

Two prohibitions:

- **Never IndexedDB** — it is a browser API and does not exist in React Native. `apps/web/` uses it;
  mobile must not.
- **Never reintroduce WatermelonDB** or its native wiring. It was replaced by Drizzle + expo-sqlite
  (spec §17.10 / ADR-048) precisely to remove the config plugins, the simdjson pod, the decorators /
  loose babel setup and the CMake patch.

### What may be written offline

| Mode                             | Entities                                                                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Offline **read/write**           | tasks, site reports, inspections, workforce attendance, material consumption, safety checklists + incidents, equipment usage |
| **Online-required** (read-cache) | POs, vendor invoices / AR / receipts / payments, budget-line mutations, vendor master, permissions/roles                     |
| Read-only stale-while-revalidate | project master, BOQ lines, room/floor reference, drawings, vendor directory                                                  |

Financial entities are **never** offline-writable — the sync push endpoint has no financial
`entity_type` case and rejects any such write with `BadRequestException`.

### Sync

Flush order on reconnect is fixed (spec §17.6): **1** safety incidents → **2** attendance → **3**
inspections → **4** task progress → **5** site reports → **6** material → **7** equipment usage →
**8** photo/media (deferred last).

Limits (spec §17.7): local DB ≤ 500 MB · drawing cache ≤ 200 MB (LRU) · photo queue ≤ 100
(warn at 80) · sync batch ≤ 500 records/cycle.

Conflict resolution is **entity-specific and must be implemented exactly as specified** — never
invent a strategy without an ADR:

| Entity                   | Strategy                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `site_reports`           | LAST_WRITE_WINS on `client_submitted_at`; flag `CONFLICT_FLAGGED` for review             |
| `issues`                 | FIELD_LEVEL_MERGE — description/resolution last-writer; status server-wins; photos union |
| photo annotation         | CONFLICT_FLAGGED — no auto-resolution (ADR-056)                                          |
| `safety_checklists`      | SERVER_WINS — client version rejected unconditionally                                    |
| `tasks.progress_percent` | MAX_WINS — progress is monotonic, resolves silently                                      |

## UI rules that fail review

- **No tables** — cards instead.
- **No navigation deeper than 3 levels** — restructure with bottom sheets or tabs.
- **No modal on modal** — bottom sheets.
- **No tap target under 44px** (WCAG AAA; 52px recommended for primary buttons).
- Bottom nav is 4–5 items per role.
- Tokens come from `apps/mobile/src/theme/tokens.ts` — **never** hardcode a hex or a `fontWeight`.
  `--mobile-primary` `#0066FF` ≠ `--cos-blue` `#2563EB`; that difference is deliberate (outdoor
  sunlight visibility) and must not be "harmonised". Likewise `mobile-radius-lg` 8px ≠
  `web-radius-lg` 12px.

Mockups are authoritative for **style** (radius, colour, spacing, badge shape, copy length) but **not
for composition** — where the implemented structure has outgrown its mockup, the implementation
stands and the reason goes in the screen's header comment (ADR-085).

## Running and capturing

```bash
cd apps/mobile
EXPO_PUBLIC_CAPTURE=1 npx expo start     # CAPTURE mutes the LogBox toast and freezes animations
pnpm capture:android                      # login flow → docs/screens/android/01-authen/01-login/
pnpm capture:android:home                 # SITE_ENGINEER dashboard
pnpm capture:android:tenant-admin-home    # TENANT_ADMIN home / alerts / settings
pnpm capture:android:site-worker          # the SITE_WORKER tab set
```

The Privacy Policy, Terms of Use, Support Center and Transparency Portal captures were **retired on
2026-08-17** (product-owner decision) and their four scripts were deleted with them, so no command
above writes `01-authen/03-privacy-policy/`, `04-terms-of-use/` or `05-get-support/` any more. The
screens are untouched — see the "not captured (retired 2026-08-17)" sections in
[`docs/screens/android/README.md`](../screens/android/README.md).

The capture scripts are adb/uiautomator, deliberately **not** Detox: Path B hands off to Keycloak in
a Chrome Custom Tab, and while Detox holds the UiAutomation connection a `uiautomator dump` only
returns the instrumented app's own window. Each script asserts the testID it expects **before**
saving, so a mis-tap fails the run instead of committing a screenshot of the wrong screen.

**One script writes each committed frame.** See
[`docs/screens/android/README.md`](../screens/android/README.md) for which script owns which folder.

## E2E

Detox, `apps/mobile/e2e/`, 3 scenarios (spec §30.5): offline check-in, offline inspection, sync
conflict resolution (Max-wins). Two traps:

- **Detox has no connectivity API.** `device.setStatusBar` is cosmetic and a NetInfo jest mock is
  unit-only. Use the app-level hook gated by `EXPO_PUBLIC_E2E=1` — deep link
  `cos://e2e/network?online=0|1`.
- **There is no boolean `element().isVisible()`.** Use `await waitFor(el).toBeVisible().withTimeout()`.

> 📎 `context/00_master_construction_os.md` § Phase 10 (the authoritative offline engine spec and the
> per-role screen inventory) ·
> [`specifications/17-offline-mobile-sync.md`](../specifications/17-offline-mobile-sync.md) §17.4–§17.10 ·
> [`specifications/32-implementation-specifications.md`](../specifications/32-implementation-specifications.md)
> §32.7 (design tokens, mobile component library).
