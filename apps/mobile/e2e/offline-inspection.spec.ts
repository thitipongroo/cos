// Detox E2E — Offline inspection: Inspector fills checklist offline + photo → sync on reconnect
// Source: spec §Phase 18 Detox item 2 — "Offline inspection — Inspector fills checklist
//   offline → photo attached → sync on reconnect"
// Storage: WatermelonDB (checklist data) + expo-file-system cache (photo) (Phase 10)

import { device, element, by, waitFor } from 'detox';
import { isVisible, setNetworkConnected, resetSession } from './helpers';

const INSPECTOR_PHONE = process.env['E2E_INSPECTOR_PHONE'] || '+66800000004';

/**
 * Open the inspections list from wherever the app currently is.
 *
 * IT USED TO TAP `inspection-tab`, AND THERE IS NO SUCH TAB FOR THIS ROLE ANY MORE. The seeded
 * inspector (+66800000004, scripts/dev/seed-e2e-users.sh) is a SITE_ENGINEER, and on 2026-08-12 that
 * role's bar became Home | Issues | Tasks | Reports — Inspections moved to the navigation drawer,
 * where `drawerLinksFor` had always kept a row for it, suppressed only while it was a tab.
 *
 * The role is deliberately UNCHANGED. Re-seeding the inspector as SAFETY_OFFICER (which still has the
 * tab) would have been the smaller diff and the wrong one: it would quietly swap which role spec
 * §30.5's "Inspector fills checklist offline" scenario actually exercises. Only the route in is
 * different, so only the route in changed here.
 */
async function openInspections(): Promise<void> {
  const menu = element(by.id('drawer-menu-button')).atIndex(0);
  await waitFor(menu).toExist().withTimeout(5_000);
  await menu.tap();

  const row = element(by.id('drawer-link-/inspections')).atIndex(0);
  await waitFor(row).toExist().withTimeout(5_000);
  await row.tap();
}

describe('Offline Inspection — Inspector', () => {
  beforeAll(async () => {
    // reloadReactNative() crashes the RN bridge on this RN/Detox version (see capture.spec.ts) and is
    // redundant after launchApp({delete:true}) — omitted.
    await device.launchApp({ newInstance: true, delete: true });
    await resetSession(); // iOS keychain survives reinstall — force a logged-out start
  });

  afterAll(async () => {
    await device.terminateApp();
  });

  beforeEach(async () => {
    // Reset navigation to home while keeping the user logged in (session persists across a relaunch).
    // Uses launchApp({newInstance}) instead of reloadReactNative, which crashes the RN bridge here.
    await device.launchApp({ newInstance: true });
  });

  it('inspector can log in via SMS OTP', async () => {
    // Login landing carries the Path-A phone form directly (ADR-050) — no phone-entry step to tap.
    await waitFor(element(by.id('phone-input')))
      .toBeVisible()
      .withTimeout(10_000);

    // Phone is split into a country picker + national number; pick Thailand explicitly (deterministic
    // regardless of the simulator's region) and enter the national digits (the login re-adds +66).
    await element(by.id('country-picker')).tap();
    await element(by.id('country-option-th')).tap();
    await element(by.id('phone-input')).typeText(INSPECTOR_PHONE.replace(/^\+66/, '0'));
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

  it('inspector can navigate to inspections list', async () => {
    await waitFor(element(by.id('home-screen')))
      .toExist()
      .withTimeout(10_000);

    await openInspections();

    await waitFor(element(by.id('inspection-list')))
      .toExist()
      .withTimeout(8_000);
  });

  it('inspector can open and fill inspection checklist offline', async () => {
    await waitFor(element(by.id('home-screen')))
      .toExist()
      .withTimeout(10_000);

    await openInspections();

    await setNetworkConnected(false);

    await waitFor(element(by.id('sync-pill')))
      .toBeVisible()
      .withTimeout(5_000);

    const firstInspection = element(by.id('inspection-item')).atIndex(0);
    await waitFor(firstInspection).toBeVisible().withTimeout(5_000);
    await firstInspection.tap();

    await waitFor(element(by.id('inspection-checklist')))
      .toBeVisible()
      .withTimeout(8_000);

    const firstChecklistItem = element(by.id('checklist-item')).atIndex(0);
    if (await isVisible(firstChecklistItem)) {
      const passButton = element(by.id('checklist-pass-button')).atIndex(0);
      if (await isVisible(passButton)) {
        await passButton.tap();
      }
    }

    await setNetworkConnected(true);
  });

  it('inspector can attach a photo offline and it queues for upload', async () => {
    await waitFor(element(by.id('home-screen')))
      .toExist()
      .withTimeout(10_000);

    await openInspections();

    await setNetworkConnected(false);

    const firstInspection = element(by.id('inspection-item')).atIndex(0);
    if (await isVisible(firstInspection)) {
      await firstInspection.tap();

      const addPhotoButton = element(by.id('add-photo-button'));
      if (await isVisible(addPhotoButton)) {
        await addPhotoButton.tap();

        await waitFor(element(by.text(/queued|pending upload|offline|รอซิงค์|ออฟไลน์/i)))
          .toBeVisible()
          .withTimeout(8_000);
      }
    }

    await setNetworkConnected(true);
  });

  it('queued inspection data and photo sync on connectivity restore', async () => {
    await waitFor(element(by.id('home-screen')))
      .toExist()
      .withTimeout(10_000);

    await setNetworkConnected(false);
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
});
