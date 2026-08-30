// This file runs in a Service Worker (not the DOM). It is excluded from the app's tsconfig (see
// exclude) and bundled by esbuild via @serwist/turbopack, so it uses the WebWorker lib in isolation
// without polluting the app's DOM types. `webworker` lib gives it ServiceWorkerGlobalScope for editors.
/// <reference lib="webworker" />

// Serwist service worker source (bundled by @serwist/turbopack via the /serwist/[path] route).
// Replaces next-pwa (webpack-only, unmaintained) with a Turbopack-compatible, maintained PWA (ADR-047).
import { defaultCache } from '@serwist/turbopack/worker';
import { Serwist, type PrecacheEntry, type SerwistGlobalConfig } from 'serwist';
import { SYNC_TAG } from '../lib/pwa/sync-tag';
import { drainQueue } from '../lib/pwa/replay-queue';

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

// ── Background Sync: replay the offline mutation queue (master:3543, 3620) ──────────────────────
//
// THIS LISTENER IS THE HALF THAT WAS MISSING. `sync-service.ts` has always called
// `registration.sync.register('cos-sync')` and its own header said "SW replays mutations on
// reconnect" — but nothing here listened, so on every browser that HAS Background Sync (Chrome and
// Edge, i.e. the tablets this client targets) the event fired into nothing and the queue was never
// drained. The fallback path that did work ran only where the API is ABSENT, so offline writes
// survived exactly on the browsers without the feature they were built on.
//
// The tag is imported rather than retyped: a literal that drifts from the registration is the same
// silent failure again, and nothing would fail to compile.
self.addEventListener('sync', (event) => {
  const syncEvent = event as ExtendableEvent & { tag?: string };
  if (syncEvent.tag !== SYNC_TAG) return;
  // waitUntil keeps the worker alive until the drain settles; without it the browser may kill it
  // mid-flight and the retry counters would record attempts that never reached the server.
  syncEvent.waitUntil(drainQueue());
});
