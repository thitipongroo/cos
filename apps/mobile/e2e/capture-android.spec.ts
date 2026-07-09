// Android screenshot-capture E2E — the Android sibling of capture.spec.ts (iOS). Logs in once
// (Path A phone+OTP against the local backend with E2E_AUTH_BYPASS=true, fixed OTP 123456), then
// deep-links each app route and writes the emulator frame to docs/screens/android/ via
// `adb exec-out screencap`. Documentation generator, not a functional test.
// Run: detox test -c android.emu.release e2e/capture-android.spec.ts
import { by, device, element } from 'detox';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = resolve(__dirname, '../../../docs/screens/android');
const PHONE = '+66800000002'; // PROJECT_MANAGER (via Keycloak) — widest data set
const OTP = '123456';
const PROJECT_ID = 'b0000000-0000-4000-8000-000000000001';

const ROUTES = [
  'home',
  'dashboard',
  'projects',
  'tasks',
  'portfolio',
  'budget',
  'invoices',
  'payments',
  'procurement',
  'rfqs',
  'orders',
  'deliveries',
  'issues',
  'incidents',
  'inspections',
  'reports',
  'report',
  'alerts',
  'conflict-review',
  'profile',
];

// Android equivalent of `xcrun simctl io booted screenshot`: pull a PNG straight off the emulator.
function shot(name: string): void {
  execSync(`adb exec-out screencap -p > "${OUT}/${name}.png"`, {
    stdio: 'ignore',
    shell: '/bin/bash',
  });
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('android screen capture', () => {
  beforeAll(async () => {
    mkdirSync(OUT, { recursive: true });
    // The app polls the backend continuously, so on Android `launchApp` hangs waiting for the app to
    // reach Detox's "idle" state (unlike iOS). Pass `detoxURLBlacklistRegex: '.*'` at launch so Detox
    // ignores ALL network requests for idle-tracking (the native LaunchArgs reads this) — launchApp
    // then returns immediately. We drive the whole suite sync-free with fixed delays anyway.
    // `delete: true` wipes app data (offline DB) → clean login screen.
    await device.launchApp({
      newInstance: true,
      delete: true,
      launchArgs: { detoxURLBlacklistRegex: '.*' },
    });
    await device.disableSynchronization();
  });

  it('logs in and lands on home', async () => {
    await delay(6000);
    shot('00-login');
    // The login screen shows both auth paths (office email/password button + field-worker OTP link,
    // ADR-050). Tap the OTP link first to reach the phone-input screen.
    await element(by.id('field-login-link')).tap();
    await delay(1500);
    // Phone is split into a country picker + national number; pick Thailand explicitly (deterministic
    // regardless of the emulator's region) and enter the national digits (the login re-adds +66).
    await element(by.id('country-picker')).tap();
    await element(by.id('country-option-th')).tap();
    await element(by.id('phone-input')).tap();
    await element(by.id('phone-input')).replaceText(PHONE.replace(/^\+66/, ''));
    await delay(1500);
    await element(by.id('request-otp-button')).tap();
    await delay(6000);
    await element(by.id('otp-input')).tap();
    await element(by.id('otp-input')).replaceText(OTP);
    await delay(1000);
    await element(by.id('verify-otp-button')).tap();
    await delay(8000);
  });

  it('captures every app route', async () => {
    // Prime the offline project cache so every later ProjectPicker shows the project chip.
    await device.openURL({ url: 'cos:///projects' });
    await delay(4000);

    let i = 1;
    for (const route of ROUTES) {
      await device.openURL({ url: `cos:///${route}` });
      await delay(2500);
      try {
        await element(by.id(`project-option-${PROJECT_ID}`))
          .atIndex(0)
          .tap();
        await delay(2500);
      } catch {
        /* screen has no project picker — capture as-is */
      }
      shot(`${String(i).padStart(2, '0')}-${route}`);
      i += 1;
    }
  }, 420000);
});
