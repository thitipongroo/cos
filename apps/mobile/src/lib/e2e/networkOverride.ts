// E2E-only network override.
//
// Lets Detox force the app online/offline at runtime so offline flows can be exercised in E2E,
// since Detox has no built-in connectivity toggle and `device.setStatusBar({network})` is not a
// real connectivity API. `useNetworkStatus` consults this module; the transport that sets it is a
// deep link handled in the root layout (see app/_layout.tsx) driven by the `setNetworkConnected`
// Detox helper.
//
// INERT IN PRODUCTION: every mutator/subscription is a no-op unless `EXPO_PUBLIC_E2E === '1'`, and
// `getForcedOnline()` always returns null when disabled — so real users always use real NetInfo and
// this hook can never affect them.

export function isE2EEnabled(): boolean {
  return process.env['EXPO_PUBLIC_E2E'] === '1';
}

// null = no override (use real NetInfo); true/false = force online/offline.
let forcedOnline: boolean | null = null;
const listeners = new Set<() => void>();

export function getForcedOnline(): boolean | null {
  return isE2EEnabled() ? forcedOnline : null;
}

export function setForcedOnline(value: boolean | null): void {
  if (!isE2EEnabled()) return;
  forcedOnline = value;
  listeners.forEach((cb) => cb());
}

export function subscribeNetworkOverride(cb: () => void): () => void {
  if (!isE2EEnabled()) return () => {};
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// Test-only reset so unit tests start from a clean slate.
export function __resetNetworkOverrideForTests(): void {
  forcedOnline = null;
  listeners.clear();
}
