# Construction OS — Web App (Next.js + PWA)

**Runtime:** Next.js 14 + next-pwa (Workbox) + TypeScript
**Platform:** Tablet / laptop browser — **online + offline** (unified)
**Phase:** Phase 10 (UI scaffolding + PWA offline engine), Phase 3–7 (feature screens)

## Purpose

Unified tablet/laptop web application for all roles. Supports both online and offline use in a
single app — no manual app switching required. When online, API calls are made directly to the
backend. When offline, the Service Worker intercepts requests and serves cached data; mutations
are queued in IndexedDB and replayed when connectivity is restored.

See ADR-016 for the architectural decision to merge the original `apps/web` (online-only) and
`apps/pwa` (offline-only) into this single app.

## Public API

None — consumes backend REST API at `NEXT_PUBLIC_API_URL`.

## Local storage (offline)

- **IndexedDB** via `idb` library (typed, versioned schema) — offline entity cache
- **Background Sync API** via Workbox — mutation queue replay on reconnect
- **Service Worker** via `next-pwa` (Workbox) — asset + API response caching

## Dependencies

- Backend REST API (`/api/v1/*`)
- Keycloak OIDC for auth (Phase 2)
- `next-pwa` — Workbox-based service worker generation
- `idb` — typed IndexedDB wrapper

## Configuration

```bash
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_KEYCLOAK_URL=http://localhost:8080
NEXT_PUBLIC_KEYCLOAK_REALM=construction-os
NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=cos-web
```

## Usage

```bash
pnpm --filter @cos/web dev
pnpm --filter @cos/web build
```

## Design system

Uses `@cos/types` design tokens (spec §32.7):

- Primary font: Inter Tight
- Base unit: 14px body, 4px spacing grid
- Brand blue: `#2563EB`
