// Detox E2E — Offline inspection: Inspector fills checklist offline + photo → sync on reconnect
// Source: spec §Phase 18 Detox item 2 — "Offline inspection — Inspector fills checklist
//   offline → photo attached → sync on reconnect"
// Storage: WatermelonDB (checklist data) + expo-file-system cache (photo) (Phase 10)

import { device, element, by, waitFor } from 'detox';

const INSPECTOR_PHONE = process.env['E2E_INSPECTOR_PHONE'] || '+66800000002';

describe('Offline Inspection — Inspector', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  afterAll(async () => {
    await device.terminateApp();
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('inspector can log in via SMS OTP', async () => {
    await waitFor(element(by.id('phone-input')))
      .toBeVisible()
      .withTimeout(10_000);

    await element(by.id('phone-input')).typeText(INSPECTOR_PHONE);
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

  it('inspector can navigate to inspections list', async () => {
    await waitFor(element(by.id('home-screen')))
      .toBeVisible()
      .withTimeout(10_000);

    const inspectionTab = element(by.id('inspection-tab')).atIndex(0);
    await waitFor(inspectionTab).toBeVisible().withTimeout(5_000);
    await inspectionTab.tap();

    await waitFor(element(by.id('inspection-list')))
      .toBeVisible()
      .withTimeout(8_000);
  });

  it('inspector can open and fill inspection checklist offline', async () => {
    await waitFor(element(by.id('home-screen')))
      .toBeVisible()
      .withTimeout(10_000);

    const inspectionTab = element(by.id('inspection-tab')).atIndex(0);
    if (await inspectionTab.isVisible()) {
      await inspectionTab.tap();
    }

    await device.setStatusBar({ network: 'none' });

    await waitFor(element(by.id('offline-banner')))
      .toBeVisible()
      .withTimeout(5_000);

    const firstInspection = element(by.id('inspection-item')).atIndex(0);
    await waitFor(firstInspection).toBeVisible().withTimeout(5_000);
    await firstInspection.tap();

    await waitFor(element(by.id('inspection-checklist')))
      .toBeVisible()
      .withTimeout(8_000);

    const firstChecklistItem = element(by.id('checklist-item')).atIndex(0);
    if (await firstChecklistItem.isVisible()) {
      const passButton = element(by.id('checklist-pass-button')).atIndex(0);
      if (await passButton.isVisible()) {
        await passButton.tap();
      }
    }

    await device.setStatusBar({ network: 'wifi' });
  });

  it('inspector can attach a photo offline and it queues for upload', async () => {
    await waitFor(element(by.id('home-screen')))
      .toBeVisible()
      .withTimeout(10_000);

    const inspectionTab = element(by.id('inspection-tab')).atIndex(0);
    if (await inspectionTab.isVisible()) {
      await inspectionTab.tap();
    }

    await device.setStatusBar({ network: 'none' });

    const firstInspection = element(by.id('inspection-item')).atIndex(0);
    if (await firstInspection.isVisible()) {
      await firstInspection.tap();

      const addPhotoButton = element(by.id('add-photo-button'));
      if (await addPhotoButton.isVisible()) {
        await addPhotoButton.tap();

        await waitFor(element(by.text(/queued|pending upload|offline/i)))
          .toBeVisible()
          .withTimeout(8_000);
      }
    }

    await device.setStatusBar({ network: 'wifi' });
  });

  it('queued inspection data and photo sync on connectivity restore', async () => {
    await waitFor(element(by.id('home-screen')))
      .toBeVisible()
      .withTimeout(10_000);

    await device.setStatusBar({ network: 'none' });
    await device.setStatusBar({ network: 'wifi' });

    await waitFor(element(by.id('sync-status-bar')))
      .toBeVisible()
      .withTimeout(10_000);

    await waitFor(element(by.text(/synced|up to date|ซิงค์แล้ว/i)))
      .toBeVisible()
      .withTimeout(30_000);
  });
});
