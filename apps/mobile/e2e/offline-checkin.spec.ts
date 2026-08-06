// Detox E2E — Offline check-in: worker checks in offline → queued → sync on reconnect
// Source: spec §Phase 18 Detox item 1 — "Offline check-in — Worker checks in with no
//   connectivity → record queued → sync on reconnect"
// Strategy: WatermelonDB + expo-sqlite sync_queue (Phase 10 spec)

import { device, element, by, waitFor } from 'detox';
import { isVisible, setNetworkConnected, resetSession } from './helpers';

const WORKER_PHONE = process.env['E2E_WORKER_PHONE'] || '+66800000001';

describe('Offline Check-In — Worker', () => {
  beforeAll(async () => {
    // launchApp({delete:true}) already gives a fresh JS + wiped app data; resetSession clears the
    // iOS keychain session. device.reloadReactNative() is redundant here AND crashes the RN bridge on
    // this RN/Detox version (see capture.spec.ts), so it is intentionally omitted.
    await device.launchApp({ newInstance: true, delete: true });
    await resetSession(); // iOS keychain survives reinstall — force a logged-out start
  });

  afterAll(async () => {
    await device.terminateApp();
  });

  beforeEach(async () => {
    // Reset app state between tests via a relaunch (newInstance) instead of reloadReactNative, which
    // crashes the RN bridge on this RN/Detox version.
    await device.launchApp({ newInstance: true });
  });

  it('worker can log in via SMS OTP', async () => {
    // The login landing carries the Path-A phone form directly (office email/password button is the
    // secondary action, ADR-050) — there is no separate phone-entry screen to tap through.
    await waitFor(element(by.id('phone-input')))
      .toBeVisible()
      .withTimeout(10_000);

    // Phone is split into a country picker + national number; pick Thailand explicitly (deterministic
    // regardless of the simulator's region) and enter the national digits (the login re-adds +66).
    await element(by.id('country-picker')).tap();
    await element(by.id('country-option-th')).tap();
    await element(by.id('phone-input')).typeText(WORKER_PHONE.replace(/^\+66/, '0'));
    await element(by.id('request-otp-button')).tap();

    await waitFor(element(by.id('otp-input')))
      .toBeVisible()
      .withTimeout(10_000);

    const testOtp = process.env['E2E_TEST_OTP'] || '123456';
    await element(by.id('otp-input')).typeText(testOtp);
    await element(by.id('verify-otp-button')).tap();

    await waitFor(element(by.id('home-screen')))
      .toExist()
      .withTimeout(15_000);
  });

  it('check-in button is available on home screen', async () => {
    await waitFor(element(by.id('home-screen')))
      .toExist()
      .withTimeout(10_000);

    const checkInButton = element(by.id('check-in-button')).atIndex(0);
    await waitFor(checkInButton).toBeVisible().withTimeout(5_000);
  });

  it('worker can check in while device is offline — record is queued', async () => {
    await waitFor(element(by.id('home-screen')))
      .toExist()
      .withTimeout(10_000);

    await setNetworkConnected(false);

    const checkInButton = element(by.id('check-in-button'));
    await waitFor(checkInButton).toBeVisible().withTimeout(5_000);
    await checkInButton.tap();

    await waitFor(element(by.id('sync-pill')))
      .toBeVisible()
      .withTimeout(5_000);

    await waitFor(element(by.text(/queued|offline|pending sync|ออฟไลน์|รอซิงค์|เช็คอินแล้ว/i)))
      .toBeVisible()
      .withTimeout(8_000);

    await setNetworkConnected(true);
  });

  it('sync queue item is uploaded when connectivity is restored', async () => {
    await waitFor(element(by.id('home-screen')))
      .toExist()
      .withTimeout(10_000);

    await setNetworkConnected(false);

    const checkInButton = element(by.id('check-in-button'));
    if (await isVisible(checkInButton)) {
      await checkInButton.tap();
    }

    await setNetworkConnected(true);

    // The full-width green sync strip was replaced by the top-bar <SyncPill /> for every role
    // (PO decision 2026-08-04). The pill is icon-only, so the synced state is asserted on its
    // accessibilityLabel (i18n sync.pill.synced) rather than on-screen text.
    await waitFor(element(by.id('sync-pill')))
      .toBeVisible()
      .withTimeout(10_000);

    await waitFor(element(by.label(/synced|ซิงค์แล้ว/i)))
      .toBeVisible()
      .withTimeout(30_000);
  });

  it('offline banner disappears when connectivity is restored', async () => {
    await setNetworkConnected(false);
    await waitFor(element(by.id('sync-pill')))
      .toBeVisible()
      .withTimeout(8_000);

    await setNetworkConnected(true);
    await waitFor(element(by.id('sync-pill')))
      .not.toBeVisible()
      .withTimeout(10_000);
  });
});
