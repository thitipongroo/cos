// PWA via Serwist (@serwist/turbopack) — Turbopack-compatible, replaces next-pwa (ADR-047).
import { withSerwist } from '@serwist/turbopack';

// Static security headers (QM-4; docs/policies/csp-policy.md "Other mandatory security headers").
// These are env-agnostic and carry zero runtime risk. HSTS is only honored by browsers over HTTPS,
// so setting it unconditionally is safe for local http dev (ignored there). CSP is NOT here: a strict
// no-unsafe-inline policy requires a per-request nonce, which static headers() cannot emit — it is
// applied in middleware (see src/middleware.ts).
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Required for Docker multi-stage build (spec §8.9) — produces .next/standalone
  output: 'standalone',
  // dxf-viewer + three ship untranspiled ES modules — transpile them for the client bundle.
  transpilePackages: ['dxf-viewer', 'three'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default withSerwist(nextConfig);
