// Shared Detox E2E helpers.
//
// Why this file exists: the specs previously used `element(...).isVisible()` (returns a boolean) and
// `device.setStatusBar({ network })` — neither is a real Detox API. Detox has no boolean visibility
// getter and no cross-platform connectivity toggle. These helpers wrap the correct idioms.

import { by, device, element, waitFor } from 'detox';

type El = Parameters<typeof waitFor>[0];

/**
 * Boolean visibility check. Detox has no `element().isVisible()` returning a boolean — the idiom is
 * `waitFor(el).toBeVisible().withTimeout()`, which throws on timeout. We catch that to get a boolean.
 */
export async function isVisible(el: El, timeout = 2000): Promise<boolean> {
  try {
    await waitFor(el).toBeVisible().withTimeout(timeout);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the first testID (in priority order) that is currently visible, falling back to the first
 * id's element if none are visible. Replaces the invalid `element(...).or(element(...))` chain
 * (Detox has no `.or()` on elements).
 */
export async function firstVisible(testIds: readonly string[], timeout = 2000) {
  for (const id of testIds) {
    const candidate = element(by.id(id)).atIndex(0);
    if (await isVisible(candidate, timeout)) return candidate;
  }
  return element(by.id(testIds[0]!)).atIndex(0);
}

/**
 * Toggle simulated connectivity mid-test.
 *
 * Detox has NO built-in, cross-platform connectivity toggle, and `device.setStatusBar({ network })`
 * is NOT a connectivity API. Instead we drive an app-level E2E hook: `useNetworkStatus` consults
 * `src/lib/e2e/networkOverride`, which the root layout updates from the deep link opened here. This
 * toggles online/offline without relaunching, so session state (login, navigation) is preserved.
 *
 * REQUIRES the app built with `EXPO_PUBLIC_E2E=1` (otherwise the hook is inert and this is a no-op
 * at the app side). iOS simulators have no programmatic airplane mode; this hook sidesteps that by
 * forcing the app's own network state rather than the OS. Runtime behaviour (and any expo-router
 * deep-link interaction) must be confirmed on a real Detox run.
 */
export async function setNetworkConnected(connected: boolean): Promise<void> {
  await device.openURL({ url: `cos://e2e/network?online=${connected ? '1' : '0'}` });
}
