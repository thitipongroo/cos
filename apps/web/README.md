# Construction OS — Web App (Next.js)

**Runtime:** Next.js 14 + TypeScript  
**Platform:** Tablet / laptop browser — **online only**  
**Phase:** Phase 10 (UI scaffolding), Phase 3–7 (feature screens)

## Purpose

Desktop/tablet web application for online-only use.
All roles can access this platform when on tablet or laptop with internet connectivity.
When offline on tablet/laptop → use the PWA (`apps/pwa`).

## Public API

None — consumes backend REST API at `NEXT_PUBLIC_API_URL`.

## Dependencies

- Backend REST API (`/api/v1/*`)
- Keycloak OIDC for auth (Phase 2)

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
- Brand blue: `#2563EB` (not mobile primary `#0066FF`)
