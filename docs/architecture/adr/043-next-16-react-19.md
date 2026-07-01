# ADR-043: Next.js 16 + React 19 upgrade (web)

**Date:** 2026-07-01
**Status:** Accepted
**Deciders:** Product owner / engineering lead
**Tags:** architecture

---

## Context

apps/web was pinned to Next.js 14 + React 18. `pnpm-workspace.yaml` `auditConfig` recorded this as an
intentional lock ("Locked by next@14 — needs Next.js 15 upgrade"), holding open two next-router
CVE-ignores. React 19 requires Next >= 15; Next 16 supports React 18 || 19. Node >= 20.9 is required
(platform runs 24).

Next 16 introduces breaking changes that surfaced empirically during the upgrade:

- `next build` defaults to Turbopack, which does not run the webpack config that `next-pwa` (the PWA
  service-worker plugin, §32.7 offline shell) hooks into.
- The `middleware` file convention is deprecated in favour of `proxy`, and Next 16's build analyzer
  rejects a bare `export { default } from 'next-auth/middleware'` re-export.
- Dynamic route `params` / `searchParams` became async (`Promise`).
- React 19's JSX types are stricter; `recharts@2` types are incompatible.

## Decision

Upgrade apps/web to Next.js 16 + React 19, keeping NextAuth v4 (4.24.14 declares Next 16 support):

- **next** 14->16, **react**/**react-dom** 18->19, **@types/react**/**@types/react-dom** ->19.
- **next-pwa (webpack) stopgap:** run `next build --webpack` so the existing next-pwa
  service-worker + runtimeCaching config keeps working unchanged. next-pwa is unmaintained and
  webpack-only; migrating to **Serwist** (`@serwist/next`, Turbopack-compatible) is a documented
  follow-up, deferred to keep this change scoped to the framework/runtime bump.
- **middleware.ts:** import then re-export the NextAuth middleware so the default is a resolvable
  function value (the `proxy` rename is deferred; it is a warning, not an error).
- **Async request API:** migrate dynamic pages with the official `@next/codemod
  next-async-request-api` (params/searchParams awaited).
- **recharts** 2->3 (React 19 compatible).
- Allow the `sharp` build script (Next 16 image optimisation native dep).
- Clear the now-unblocked next@14 CVE-ignores.

Verified: `build` (Turbopack-off webpack build + static generation), type-check, lint; backend
suites unaffected (100% coverage, workflows, integration all green after regenerating the Prisma
client, whose build hash includes the React types).

## Rationale

The next@14 lock exists only to defer this migration; Next 16 is the supported path and reopens the
CVE fixes. Keeping NextAuth v4 avoids an Auth.js v5 migration — v4.24.14 already supports Next 16.
The `--webpack` stopgap is the minimal, verifiable way to keep the offline-PWA behaviour byte-for-byte
while moving the framework; a Serwist migration is orthogonal and larger (offline E2E revalidation).

## Consequences

### Positive

- Web framework current; React 19; CVE-ignores for next@14 removed.

### Negative

- `next build --webpack` opts out of Turbopack (Next 16's default/faster build) and keeps an
  unmaintained next-pwa; both are addressed by the Serwist follow-up.

### Neutral

- No API or backend change; NextAuth v4 retained.

## References

- `pnpm-workspace.yaml` `auditConfig` (next@14 CVE-ignores); QM-4; §32.7 (web/PWA); Next 16 +
  React 19 migration guides; `@next/codemod next-async-request-api`
