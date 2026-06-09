# ADR-016: Unified Next.js + PWA Web App (apps/web/)

**Date:** 2026-06-07
**Status:** Accepted
**Deciders:** Product Owner
**Tags:** architecture | mobile

---

## Context

The original platform design specified two separate Next.js apps targeting tablet/laptop browsers:

- `apps/web/` — online only; no offline support
- `apps/pwa/` — offline only; prompts user to switch to `apps/web/` when connectivity restored

Both apps targeted the same users (all roles), the same devices (tablet/laptop browser), and would have shared nearly all UI pages, components, API calls, state management, and design tokens. The only difference was offline capability.

This separation created significant implementation duplication and a poor UX: users had to maintain two separate apps and manually switch between them depending on connectivity state.

## Decision

Merge `apps/web/` and `apps/pwa/` into a single unified Next.js app at `apps/web/` (`@cos/web`).

The unified app:

- Uses `next-pwa` (Workbox-based) for service worker and offline caching
- Uses `idb` for typed IndexedDB access (offline entity storage)
- Handles both online and offline in the same codebase — no UX switching required
- Runs on port 3001 in development
- `apps/pwa/` directory is deleted

## Rationale

PWAs are designed to work in both online and offline states — this is the standard pattern. A single app with `next-pwa` provides:

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

- Service worker adds build complexity (cache versioning, Workbox config)
- Must configure Workbox strategies correctly per route type

### Neutral

- `pnpm-workspace.yaml` unchanged — uses `apps/*` wildcard
- `turbo.json` unchanged — app-agnostic pipeline definitions
- `apps/mobile/` unaffected — React Native path unchanged

## References

- Original platform decision: `context/00_master_construction_os.md` §PLATFORM DECISION
- Phase 10 spec: PWA offline engine (now implemented in apps/web/)
