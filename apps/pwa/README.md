# Construction OS — PWA (Next.js + next-pwa)

**Runtime:** Next.js + next-pwa (Workbox)  
**Platform:** Tablet / laptop browser — **offline only**  
**Phase:** Phase 10 (offline engine), Phase 1–7 (feature screens)

## Purpose

Progressive Web App for tablet/laptop users when **offline**. When the device comes back online, a banner prompts the user to switch to the full web app (`apps/web`). This is a separate app from `apps/web` with its own Service Worker and IndexedDB storage.

## Local storage

- **IndexedDB** via `idb` library (typed wrapper) — all offline entities
- Service Worker + Background Sync API for queue processing
- Never expo-sqlite (React Native only)

## Online-restored behavior

When connectivity is restored, show banner:
> "คุณออนไลน์แล้ว — เปิด Web เพื่อใช้งานเต็มรูปแบบ" + open link to apps/web

## Dependencies

- Backend REST API (same endpoints as React Native sync)
- next-pwa (Workbox strategies)
- idb library for IndexedDB

## Configuration

```bash
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_KEYCLOAK_URL=http://localhost:8080
NEXT_PUBLIC_KEYCLOAK_REALM=construction-os
NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=cos-pwa
```

## Usage

```bash
pnpm --filter @cos/pwa dev
pnpm --filter @cos/pwa build
```
