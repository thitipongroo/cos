/**
 * Route protection (spec §20.6.2) + Content-Security-Policy (QM-4; docs/security/csp-policy.md).
 *
 * Auth: wraps `next-auth`'s middleware WITHOUT options, so the authorization behaviour is unchanged —
 * unauthenticated requests to protected routes still redirect to the next-auth sign-in page (/login).
 *
 * CSP: a per-request nonce is generated (Edge-safe Web Crypto) and the policy is set nonce-based with no
 * `unsafe-inline`/`unsafe-eval` in production. It ships in **Report-Only** mode first
 * (`CSP_ENFORCE` !== 'true') so violations are logged but nothing is blocked, until a staging smoke test
 * confirms no legitimate resource breaks (QM-16 progressive delivery); set `CSP_ENFORCE=true` to enforce.
 * Development is always Report-Only and allows unsafe-inline/eval (Next.js HMR requires them).
 *
 * Coverage note: the matcher below (inherited from the auth middleware) excludes /login, static assets
 * and the PWA shell, so CSP currently rides the authenticated app routes. Extending CSP to /login and
 * flipping CSP_ENFORCE are the documented follow-ups once violations are reviewed.
 */
// Next 16's build analyzer requires the middleware default to be a resolvable function value.
import { NextResponse, type NextRequest } from 'next/server';
import withAuth from 'next-auth/middleware';

/** 128-bit base64 nonce via Web Crypto (Edge runtime has no Node `crypto`). */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

/** Origin of the backend API (NEXT_PUBLIC_API_URL includes a /api/v1 path — CSP needs the origin). */
function apiOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  if (!raw) return '';
  try {
    return new URL(raw).origin;
  } catch {
    return '';
  }
}

function buildCsp(nonce: string): string {
  const isProd = process.env.NODE_ENV === 'production';
  const api = apiOrigin();
  const wsApi = api ? api.replace(/^http/, 'ws') : '';
  // Production: nonce only. Development: allow inline/eval for the HMR runtime (Report-Only anyway).
  const scriptStyleSrc = isProd
    ? `'self' 'nonce-${nonce}'`
    : `'self' 'unsafe-inline' 'unsafe-eval'`;
  const connectSrc = ["'self'", api, wsApi].filter(Boolean).join(' ');
  return [
    `default-src 'self'`,
    `script-src ${scriptStyleSrc}`,
    `style-src ${scriptStyleSrc}`,
    // Images cannot execute; project photos are served from per-environment S3 presigned URLs, so
    // `https:` keeps the policy portable across envs (tighten to explicit hosts before enforcing).
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src ${connectSrc}`,
    `media-src 'self' blob: data:`,
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
    `object-src 'none'`,
    `frame-src 'none'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `upgrade-insecure-requests`,
  ].join('; ');
}

function cspHeaderName(): string {
  return process.env.CSP_ENFORCE === 'true'
    ? 'Content-Security-Policy'
    : 'Content-Security-Policy-Report-Only';
}

export default withAuth(function middleware(req: NextRequest) {
  const nonce = generateNonce();
  const csp = buildCsp(nonce);

  // Next.js reads the nonce from the `Content-Security-Policy` REQUEST header and applies it to its own
  // injected <script> tags; x-nonce lets Server Components read it too.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set(cspHeaderName(), csp);
  return res;
});

export const config = {
  matcher: [
    // `health` MUST stay in this exclusion list. The Kubernetes liveness/readiness probes call
    // /health/live and /health/ready unauthenticated; if this middleware catches them it answers
    // 307 → /api/auth/signin, and Kubernetes counts 2xx/3xx as success — the probe would pass
    // forever and a wedged pod would never be restarted. Removing `health` here silently disables
    // both probes. Guarded by src/app/health/__tests__/health-routes.spec.ts.
    // `trust` is the public Trust Center (PO 2026-08-03) — it publishes security-control status,
    // sub-processors and residency for prospects and auditors who have no account, so it must not
    // redirect to sign-in.
    '/((?!login|health|trust|dev/component-preview|api/auth|offline|manifest.json|sw.js|workbox-|icons/|flags/|_next/static|_next/image|favicon.ico).*)',
  ],
};
