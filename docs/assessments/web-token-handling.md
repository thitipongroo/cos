# Web Token Handling — Threat Model & Accepted Design (M11 / M12)

**Status:** Accepted (product-owner decision 2026-07-24) · **Scope:** `apps/web`

## Context

The NestJS backend authenticates with an `Authorization: Bearer <access_token>` header only — it does not
accept cookie-based auth. Two consequences on the web client follow from that constraint:

- **M12 — backend access token is readable by client JS.** `apps/web/src/lib/auth/options.ts` copies the
  backend access token onto the NextAuth session (`session.accessToken`) so client components can attach it
  as a Bearer header (`lib/api/client.ts`). Although the NextAuth session cookie itself is `httpOnly`, the
  backend token it carries is exposed to any script on the page via `/api/auth/session`.
- **M11 — vendor (Tier-2) session token is in `localStorage`.** `apps/web/src/lib/api/vendor.ts` stores the
  external-vendor portal session token in `localStorage` and sends it as a Bearer token.

The threat is **XSS → token exfiltration**: a script-injection on an authenticated page (or the vendor
portal) could read the token and act as the user until it expires.

## Decision

**Accept the Bearer-only design; do not migrate the backend to cookie/BFF auth at this time.** The
token-theft threat is mitigated by defense-in-depth rather than by removing the token from JS:

- **Content-Security-Policy (H5)** — a nonce-based CSP with **no `unsafe-inline` / `unsafe-eval`** in
  production (`apps/web/src/middleware.ts`, `docs/policies/csp-policy.md`). This is the primary control: it
  blocks the injected inline script that an exfiltration payload needs, and `connect-src` restricts where a
  script may send data. CSP currently ships **Report-Only**; enforcing it (`CSP_ENFORCE=true` after the
  staging smoke test) is the action that makes this mitigation load-bearing.
- **No XSS sinks** — `apps/web` has no `dangerouslySetInnerHTML` / `eval` / `innerHTML` (verified in the
  security review); i18n renders as text.
- **Short exposure window** — 15-minute access-token lifetime with single-use refresh-token rotation (H3),
  so a stolen access token is usable only briefly and a stolen refresh token is revoked on next use.

## Residual risk & future option

Until CSP is **enforced** (not Report-Only), the compensating control is not fully active — enforcing it is
tracked with H5. If the threat model escalates (e.g. third-party scripts are ever added, or a pentest finds
a bypass), migrate to an **httpOnly-cookie BFF proxy**: the web server holds the backend token in an
httpOnly cookie and proxies API calls, so no token reaches client JS. That is a backend (cookie auth +
CSRF) and web change, deliberately deferred here.

## References

- `apps/web/src/lib/auth/options.ts`, `apps/web/src/lib/api/vendor.ts`, `apps/web/src/lib/api/client.ts`
- `docs/policies/csp-policy.md` (H5), ADR-067 area / H3 refresh rotation
- Spec §5.9 (STRIDE threat model)
