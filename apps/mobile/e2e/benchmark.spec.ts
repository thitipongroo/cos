// G1/G2 benchmark harness (spec §17.10) — not a functional test. Launches the app fresh,
// deep-links to the on-device benchmark screen (src/app/e2e/benchmark.tsx), waits for the runs
// to finish, and captures the rendered numbers as a screenshot (the proven extraction path for
// release builds; Detox openURL avoids the "Open in COS?" system dialog that simctl openurl hits).
// Run: G1_OUT=<dir> detox test -c ios.sim.release e2e/benchmark.spec.ts
import { by, device, element } from 'detox';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const OUT = process.env['G1_OUT'] ?? tmpdir();
const N = process.env['G1_N'] ?? '500'; // batch size; 5000 = 10× §17.7-cap headroom probe
const PHONE = '+66800000002'; // E2E_AUTH_BYPASS backend, OTP fixed
const OTP = '123456';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Keychain survives reinstall, so a "fresh" install may boot straight to home. Only log in
// when the login screen is actually present.
async function loginIfNeeded(): Promise<void> {
  try {
    await element(by.id('phone-input')).tap();
  } catch {
    return; // no login screen — session restored, already on home
  }
  // Phone is split into a country picker + national number; pick Thailand explicitly (deterministic
  // regardless of device region) and enter the national digits (the login re-adds +66).
  await element(by.id('country-picker')).tap();
  await element(by.id('country-option-th')).tap();
  await element(by.id('phone-input')).tap();
  await element(by.id('phone-input')).replaceText(PHONE.replace(/^\+66/, '0'));
  await delay(1500);
  await element(by.id('request-otp-button')).tap();
  await delay(6000);
  await element(by.id('otp-input')).tap();
  await element(by.id('otp-input')).replaceText(OTP);
  await delay(1000);
  await element(by.id('verify-otp-button')).tap();
  await delay(8000);
}

describe('G1 offline-DB spike benchmark', () => {
  it('logs in, runs both engines, captures results', async () => {
    mkdirSync(OUT, { recursive: true });
    // delete:true → clean app container; benchmark leaves the WatermelonDB file as found anyway.
    await device.launchApp({ newInstance: true, delete: true });
    // Timing loops + post-login polling never idle — drive sync-free (same as capture.spec).
    await device.disableSynchronization();
    await delay(6000); // app boot
    // AuthGate bounces every non-(auth) route to /login when unauthenticated.
    await loginIfNeeded();
    // Triple slash → path URL (/e2e/benchmark) so expo-router navigates; `cos://e2e/...`
    // (hostname form) is reserved for the root-layout Linking interceptor (network/reset).
    await device.openURL({ url: `cos:///e2e/benchmark?n=${N}` });
    await delay(60000); // 2 engines × 3 iterations × (batch upsert + query) + render (n up to 5000)
    // execFileSync, not execSync: no shell, so nothing in the path can be interpreted as a command.
    // The screenshot paths are built from env vars (G1_OUT / G1_N) and interpolated straight into
    // the command line before this. That is developer tooling rather than shipped code, but passing
    // an argv array instead of a string removes the class outright and costs nothing.
    // Found by CodeQL js/shell-command-injection-from-environment and js/indirect-command-line-injection.
    execFileSync(
      'xcrun',
      ['simctl', 'io', 'booted', 'screenshot', `${OUT}/g1-benchmark-${N}.png`],
      {
        stdio: 'ignore',
      },
    );
  }, 180000);

  // Cold-read variant (§17.10 escalation, option C): seed both engines, KILL the process,
  // relaunch keeping the container, and make the timed query the first DB operation of the new
  // process — WatermelonDB cannot answer from its in-memory record cache, both engines hit disk.
  it('cold-read: seeds, restarts the process, then cold-queries both engines', async () => {
    // Phase 1 — seed. The session from the previous test survives (SecureStore/keychain persists
    // even across reinstall — capture.spec lesson), so relaunch WITHOUT delete and skip login:
    // AuthGate hydrates straight to home, then deep-link to seed mode.
    await device.launchApp({ newInstance: true });
    await device.disableSynchronization();
    await delay(8000); // boot + session hydration → home
    await loginIfNeeded();
    await device.openURL({ url: `cos:///e2e/benchmark?mode=seed&n=${N}` });
    await delay(20000);
    execFileSync('xcrun', ['simctl', 'io', 'booted', 'screenshot', `${OUT}/g1-seed-${N}.png`], {
      stdio: 'ignore',
    });

    // Phase 2 — kill process, relaunch keeping the container (delete defaults false),
    // session restores from SecureStore → home, then cold-read is the first DB op.
    await device.terminateApp();
    await delay(2000);
    await device.launchApp({ newInstance: true });
    await device.disableSynchronization();
    await delay(8000); // boot + session hydration (AuthGate → home)
    await device.openURL({ url: `cos:///e2e/benchmark?mode=cold&n=${N}` });
    await delay(20000);
    execFileSync('xcrun', ['simctl', 'io', 'booted', 'screenshot', `${OUT}/g1-cold-${N}.png`], {
      stdio: 'ignore',
    });
  }, 240000);
});
