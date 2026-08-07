# ADR-016: Unified Next.js + PWA Web App (apps/web/)

**Date:** 2026-06-07
**Status:** Accepted — Updated 2026-08-07 (PWA library superseded in part by ADR-047)
**Deciders:** Product Owner
**Tags:** architecture | mobile

> ⚠️ **Update (2026-08-07):** The **decision of this ADR still holds** — `apps/web/` is one unified
> online + offline Next.js app. Only the _service-worker library_ changed: `next-pwa` (Workbox) was
> replaced by **Serwist** (`@serwist/turbopack` + `serwist` 9.5.11) because `next-pwa` injects a
> webpack config that Next 16's Turbopack build never runs. Every `next-pwa` / Workbox reference
> below has been corrected. Authoritative source: **ADR-047**.

---

## Context

The original platform design specified two separate Next.js apps targeting tablet/laptop browsers:

- `apps/web/` — online only; no offline support
- `apps/pwa/` — offline only; prompts user to switch to `apps/web/` when connectivity restored

Both apps targeted the same users (all roles), the same devices (tablet/laptop browser),
and would have shared nearly all UI pages, components, API calls, state management, and
design tokens. The only difference was offline capability.

This separation created significant implementation duplication and a poor UX: users had
to maintain two separate apps and manually switch between them depending on connectivity
state.

## Decision

Merge `apps/web/` and `apps/pwa/` into a single unified Next.js app at `apps/web/` (`@cos/web`).

The unified app:

- Uses a service worker for offline caching — **Serwist** (`@serwist/turbopack`) as of ADR-047
- Uses `idb` for typed IndexedDB access (offline entity storage)
- Handles both online and offline in the same codebase — no UX switching required
- Runs on port 3001 in development
- `apps/pwa/` directory is deleted

## Rationale

PWAs are designed to work in both online and offline states — this is the standard
pattern. A single app with a service worker provides:

- Service Worker intercepts requests when offline and serves from cache / IndexedDB
- Normal API fetch path when online — no extra overhead
- Single deployment, single URL, continuous UX regardless of connectivity

Alternatives considered:

| Alternative                            | Rejected because                                                       |
| -------------------------------------- | ---------------------------------------------------------------------- |
| Keep both apps separate                | Massive duplication; confusing UX requiring manual app switching       |
| Keep `apps/pwa/` as unified (Option B) | `apps/web/` already had i18n content; `web` is a more descriptive name |

## Consequences

### Positive

- Single codebase for all tablet/laptop browser features
- No "switch to web" banner — seamless online/offline transition
- Half the deployment surface for browser targets

### Negative

- Service worker adds build complexity (cache versioning, service-worker config)
- Must configure the runtime-caching strategies correctly per route type

### Neutral

- `pnpm-workspace.yaml` unchanged — uses `apps/*` wildcard
- `turbo.json` unchanged — app-agnostic pipeline definitions
- `apps/mobile/` unaffected — React Native path unchanged

## Superseded content from original ADR

The original ADR named **`next-pwa` (Workbox-based)** as the service-worker implementation, in the
Decision, Rationale and Consequences sections. `next-pwa` was removed from `apps/web/` by **ADR-047**
(Next 16 runs Turbopack by default, which never executes the webpack config `next-pwa` injects) and
replaced by **Serwist** (`@serwist/turbopack` + `serwist` 9.5.11). Those three mentions have been
corrected above to prevent misapplication — a reader following this ADR literally would have
installed an unmaintained package that breaks `next build`.

The _unification_ decision this ADR exists to record — one `apps/web/` handling online and offline,
`apps/pwa/` deleted — is unchanged and still in force.

## References

- Original platform decision: `context/00_master_construction_os.md` §PLATFORM DECISION
- Phase 10 spec: PWA offline engine (now implemented in apps/web/)
- **ADR-047** — replaces `next-pwa` with Serwist (supersedes the library choice in this ADR)
