# ADR-047: Replace next-pwa with Serwist (Turbopack-compatible PWA)

**Date:** 2026-07-01
**Status:** Accepted
**Supersedes (in part):** the `next-pwa` / Workbox library choice in **ADR-016** (that ADR's
unification decision — one `apps/web/` for online + offline — still stands)
**Deciders:** Product owner / engineering lead
**Tags:** architecture, web

---

## Context

ADR-043 (Next 16 + React 19) kept the offline PWA working by forcing `next build --webpack`, because
`next-pwa` injects a webpack config that Next 16's default Turbopack build does not run. `next-pwa`
is unmaintained and webpack-only, so the app was opted out of Turbopack (Next's default, faster build
engine). That was an explicit stopgap.

## Decision

Migrate the PWA from `next-pwa` to **Serwist** (`@serwist/turbopack` + `serwist` 9.5.11), which
supports Turbopack, and switch the web build back to Turbopack (`next build`):

- **Service worker source** `src/app/sw.ts` — a `Serwist` instance with `precacheEntries:
self.__SW_MANIFEST` and `runtimeCaching: defaultCache` (from `@serwist/turbopack/worker`; the
  Next-optimized equivalent of the old next-pwa NetworkFirst/CacheFirst/StaleWhileRevalidate rules).
- **Route handler** `src/app/serwist/[path]/route.ts` — `createSerwistRoute({ swSrc })`. Because
  Turbopack does not support build plugins, Serwist bundles the SW with esbuild and serves it (and
  its chunks) from `/serwist/*` with a `Service-Worker-Allowed: /` header, so it still controls
  scope `/`.
- **next.config.mjs** — `withSerwist(nextConfig)` (adds esbuild to `serverExternalPackages`);
  replaces the CommonJS `next.config.js` withPWA wrapper.
- **Registration** — `<SerwistProvider swUrl="/serwist/sw.js">` (from `@serwist/turbopack/react`) in
  the root layout replaces next-pwa's auto-registration.
- Remove `next-pwa`; restore `build: next build` (Turbopack).

Verified: `next build` (Turbopack) succeeds and emits the service worker; offline E2E revalidation is
a follow-up.

## Rationale

Serwist is the maintained successor to next-pwa and the only current option that keeps the PWA while
using Turbopack. It removes both stopgap liabilities from ADR-043 (webpack opt-out + unmaintained
plugin).

## Consequences

### Positive

- Web build on Turbopack (Next's default); maintained PWA library; ADR-043 stopgap resolved.

### Negative

- Serwist's Turbopack integration is a route-handler/esbuild workaround (plugins are not yet
  supported in Turbopack); SW is served from `/serwist/*` rather than a static `/sw.js`.

### Follow-up

- Re-run the offline PWA E2E (Playwright) against the Serwist build.

## References

- ADR-043 (the `--webpack` stopgap this resolves); §32.7 (web/PWA); Serwist docs (next/turbo)
