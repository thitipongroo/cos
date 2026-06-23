// Detox E2E — Offline check-in: worker checks in offline → queued → sync on reconnect
// Source: spec §Phase 18 Detox item 1 — "Offline check-in — Worker checks in with no
//   connectivity → record queued → sync on reconnect"
// Strategy: WatermelonDB + expo-sqlite sync_queue (Phase 10 spec)

import { device, element, by, waitFor } from 'detox';
import { isVisible, setNetworkConnected } from './helpers';

const WORKER_PHONE = process.env['E2E_WORKER_PHONE'] || '+66800000001';

describe('Offline Check-In — Worker', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  afterAll(async () => {
    await device.terminateApp();
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('worker can log in via SMS OTP', async () => {
    await waitFor(element(by.id('phone-input')))
      .toBeVisible()
      .withTimeout(10_000);

    await element(by.id('phone-input')).typeText(WORKER_PHONE);
    await element(by.id('request-otp-button')).tap();

    await waitFor(element(by.id('otp-input')))
      .toBeVisible()
      .withTimeout(10_000);

    const testOtp = process.env['E2E_TEST_OTP'] || '123456';
    await element(by.id('otp-input')).typeText(testOtp);
    await element(by.id('verify-otp-button')).tap();

    await waitFor(element(by.id('home-screen')))
      .toBeVisible()
      .withTimeout(15_000);
  });

  it('check-in button is available on home screen', async () => {
    await waitFor(element(by.id('home-screen')))
      .toBeVisible()
      .withTimeout(10_000);

    const checkInButton = element(
      by.id('check-in-button').withAncestor(by.id('home-screen')),
    ).atIndex(0);
    await waitFor(checkInButton).toBeVisible().withTimeout(5_000);
  });

  it('worker can check in while device is offline — record is queued', async () => {
    await waitFor(element(by.id('home-screen')))
      .toBeVisible()
      .withTimeout(10_000);

    await setNetworkConnected(false);

    const checkInButton = element(by.id('check-in-button'));
    await waitFor(checkInButton).toBeVisible().withTimeout(5_000);
    await checkInButton.tap();

    await waitFor(element(by.id('offline-banner')))
      .toBeVisible()
      .withTimeout(5_000);

    await waitFor(element(by.text(/queued|offline|pending sync/i)))
      .toBeVisible()
      .withTimeout(8_000);

    await setNetworkConnected(true);
  });

  it('sync queue item is uploaded when connectivity is restored', async () => {
    await waitFor(element(by.id('home-screen')))
      .toBeVisible()
      .withTimeout(10_000);

    await setNetworkConnected(false);

    const checkInButton = element(by.id('check-in-button'));
    if (await isVisible(checkInButton)) {
      await checkInButton.tap();
    }

    await setNetworkConnected(true);

    await waitFor(element(by.id('sync-status-bar')))
      .toBeVisible()
      .withTimeout(10_000);

    await waitFor(element(by.text(/synced|up to date|ซิงค์แล้ว/i)))
      .toBeVisible()
      .withTimeout(30_000);
  });

  it('offline banner disappears when connectivity is restored', async () => {
    await setNetworkConnected(false);
    await waitFor(element(by.id('offline-banner')))
      .toBeVisible()
      .withTimeout(8_000);

    await setNetworkConnected(true);
    await waitFor(element(by.id('offline-banner')))
      .not.toBeVisible()
      .withTimeout(10_000);
  });
});
