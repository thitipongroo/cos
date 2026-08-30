// The Background Sync tag, declared ONCE.
//
// It is registered by the page (sync-service.ts) and listened for by the Service Worker (app/sw.ts).
// Those are two separate bundles, so a literal repeated in both compiles cleanly while silently
// never matching — which is exactly the failure this file exists to make impossible.
export const SYNC_TAG = 'cos-sync';
