'use client';

// Registers the next-pwa service worker on mount.
// next-pwa auto-generates /sw.js during build; this component triggers registration.
// Must be a Client Component — cannot use navigator in Server Components.

import { useEffect } from 'react';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW registration failure is non-fatal — app continues in online-only mode
    });
  }, []);

  return null;
}
