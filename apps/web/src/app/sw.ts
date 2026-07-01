// This file runs in a Service Worker (not the DOM). It is excluded from the app's tsconfig (see
// exclude) and bundled by esbuild via @serwist/turbopack, so it uses the WebWorker lib in isolation
// without polluting the app's DOM types. `webworker` lib gives it ServiceWorkerGlobalScope for editors.
/// <reference lib="webworker" />

// Serwist service worker source (bundled by @serwist/turbopack via the /serwist/[path] route).
// Replaces next-pwa (webpack-only, unmaintained) with a Turbopack-compatible, maintained PWA (ADR-047).
import { defaultCache } from '@serwist/turbopack/worker';
import { Serwist, type PrecacheEntry, type SerwistGlobalConfig } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Precache manifest injected at build time.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // defaultCache: NetworkFirst for pages/RSC/API, CacheFirst/SWR for static assets & fonts — the
  // Next-optimized equivalent of the previous next-pwa runtimeCaching rules.
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
