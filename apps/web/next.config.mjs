// PWA via Serwist (@serwist/turbopack) — Turbopack-compatible, replaces next-pwa (ADR-047).
import { withSerwist } from '@serwist/turbopack';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Required for Docker multi-stage build (spec §8.9) — produces .next/standalone
  output: 'standalone',
  // dxf-viewer + three ship untranspiled ES modules — transpile them for the client bundle.
  transpilePackages: ['dxf-viewer', 'three'],
};

export default withSerwist(nextConfig);
