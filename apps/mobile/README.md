# Construction OS — Mobile App (React Native + Expo)

**Runtime:** React Native + Expo (managed workflow)  
**Platform:** iOS / Android smartphone — **online + offline**  
**Phase:** Phase 10 (offline engine), Phase 1–7 (feature screens per role)

## Purpose

Smartphone-only native application for all roles. Offline-first: all actions queue locally and sync when connectivity returns. Do NOT use on tablet — tablet users should use the web app (online) or PWA (offline).

## Local storage

- **WatermelonDB 0.28.x** with `ExpoSQLiteAdapter` — ALL main business entities (site_reports, issues, local_photos, PRs, POs, etc.)
- **expo-sqlite directly** — ONLY for the `sync_queue` infrastructure table
- **Never** IndexedDB in React Native (browser API — unavailable in RN)

## Offline sync

`SyncManager` class (Phase 10) handles:

- Delta sync: `GET /api/v1/sync/delta?since=...`
- Queue processing: FIFO, exponential backoff, max 3 retries
- Conflict resolution: entity-specific strategies (Phase 6 spec)

## Dependencies

- Backend REST API (`/api/v1/*`)
- Expo Push Notifications (APNs + FCM via expo-server-sdk — not direct FCM)

## Configuration

```bash
EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1
EXPO_PUBLIC_KEYCLOAK_URL=http://localhost:8080
```

## Usage

```bash
pnpm --filter @cos/mobile dev       # Start Expo dev server
pnpm --filter @cos/mobile build     # EAS Build
```

## Mobile UX rules (spec §32.7)

- Minimum tap target: 44px (WCAG AAA), recommended 52px primary buttons
- No tables → use cards
- Max 3 navigation levels
- No modal-on-modal → use bottom sheets
- Primary color: `#0066FF` (outdoor visibility, not `#2563EB`)
