// Serwist Turbopack route handler — Turbopack has no build-plugin support, so Serwist bundles the
// service worker with esbuild and serves it (and its chunks) here, with `Service-Worker-Allowed: /`
// so it still controls scope `/`. The client registers it via `<SerwistProvider swUrl="/serwist/sw.js">`.
// (ADR-047)
import { createSerwistRoute } from '@serwist/turbopack';

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute(
  {
    swSrc: 'src/app/sw.ts',
    // Native esbuild on Windows, esbuild-wasm everywhere else — @serwist/turbopack's own default,
    // restored here now that `esbuild` is an actual devDependency of this app.
    //
    // History: this was pinned to `false` (wasm on every platform) because only `esbuild-wasm` was
    // installed, so the default reached for a package that did not exist and `next build` died with
    // ERR_MODULE_NOT_FOUND on Windows. Forcing wasm traded that for a second Windows-only failure —
    // `next build` aborted while prerendering /serwist/sw.js with:
    //     The working directory "D:\...\apps\web" is not an absolute path
    // The esbuild-wasm instance Turbopack loads during the build validates paths with POSIX rules,
    // and esbuild always sends `absWorkingDir` (defaulting to `process.cwd()`), so a `D:\` path is
    // always rejected. Linux CI never saw it — `/home/runner/...` is POSIX-absolute either way.
    //
    // There is no supported way to override that from here: `absWorkingDir` is absent from
    // @serwist/turbopack's 55-entry SUPPORTED_ESBUILD_OPTIONS allowlist and its zod schema drops
    // any key outside that list, and the `cwd` option feeds `outdir`, not `absWorkingDir` (both
    // verified against the installed 9.5.11 source and by running the build). Using the native
    // binary on Windows sidesteps the wasm path validation entirely, which is exactly why upstream
    // defaults to it there. `esbuild` is pinned to the same version as `esbuild-wasm` so the two
    // never disagree on the service protocol, and `allowBuilds.esbuild` in pnpm-workspace.yaml lets
    // its postinstall link the platform binary.
    useNativeEsbuild: process.platform === 'win32',
  },
);
