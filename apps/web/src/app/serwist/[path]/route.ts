// Serwist Turbopack route handler — Turbopack has no build-plugin support, so Serwist bundles the
// service worker with esbuild and serves it (and its chunks) here, with `Service-Worker-Allowed: /`
// so it still controls scope `/`. The client registers it via `<SerwistProvider swUrl="/serwist/sw.js">`.
// (ADR-047)
import { createSerwistRoute } from '@serwist/turbopack';

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute(
  {
    swSrc: 'src/app/sw.ts',
  },
);
