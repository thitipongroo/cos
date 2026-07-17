// Serwist Turbopack route handler — Turbopack has no build-plugin support, so Serwist bundles the
// service worker with esbuild and serves it (and its chunks) here, with `Service-Worker-Allowed: /`
// so it still controls scope `/`. The client registers it via `<SerwistProvider swUrl="/serwist/sw.js">`.
// (ADR-047)
import { createSerwistRoute } from '@serwist/turbopack';

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute(
  {
    swSrc: 'src/app/sw.ts',
    // Pin the bundler to esbuild-wasm on every platform. @serwist/turbopack defaults this to
    // `process.platform === 'win32'`, i.e. it reaches for the NATIVE `esbuild` package on Windows —
    // which this repo does not depend on (only `esbuild-wasm` is in package.json, per §32.7
    // "bundled by `esbuild-wasm` at build time"). Left at the default, `next build` fails on a
    // Windows dev machine with ERR_MODULE_NOT_FOUND while passing on Linux CI.
    useNativeEsbuild: false,
  },
);
