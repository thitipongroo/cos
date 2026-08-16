// Shared MFA-intro screenshot capture — adb/uiautomator only (same approach as
// capture-android-home.mjs). Logs in as a SITE_WORKER (Somsak Duangdee, +66811000010) and captures
// the one in-app screen of the MFA enrolment flow:
//   docs/screens/android/02-shared/01-mfa/01-app-intro.png — the in-app MFA enrolment intro
// The Keycloak hosted-browser steps (`02`–`07` in that same folder) are captured by hand, because they
// run outside the app where adb/uiautomator cannot drive them.
//
// THIS SCRIPT USED TO WRITE THREE MORE FRAMES; THEY WERE RETIRED ON 2026-08-16 (product-owner
// decision) and their steps were removed with them:
//   02-shared/03-navigation-drawer.png            — the drawer, opened from the top bar
//   02-shared/01-notification-preferences.png     — the preferences route, stitched full-page
//   02-shared/02-notification-preferences-saved.png — its post-save state
// Same treatment the PROJECT_MANAGER vendor frame and the CRM folder got on 2026-08-11, and for the
// same reason: a script that still writes a retired path recreates it on the next run. **Neither
// SCREEN was removed from the app** — only their screenshots left this set. The drawer is still
// opened from the top bar and notification-preferences is still the TENANT_ADMIN Settings tab
// (ADR-085: a capture leaving the set does not remove reviewed working capability). Dropping the
// preferences step also dropped the only capture step in this repo that WROTE to the database — it
// pressed SAVE CHANGES for real to reach the `if (saved)` branch.
//
// What this script exists to prevent is unchanged: mfa-enrollment and notification-preferences are
// `href: null` in components/MobileNav.tsx, so a fresh capture shows the correct 4-tab bar instead of
// the tofu-icon tabs the old hand-made frames carried. Prereqs are the same as
// capture-android-home.mjs, plus Metro started with EXPO_PUBLIC_CAPTURE=1 so the dev-only LogBox
// toast is suppressed (see src/app/_layout.tsx).
// Run: node scripts/capture-android-shared-mfa.mjs

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_BASE = resolve(HERE, '../../../docs/screens/android');
const PKG = 'com.constructionos.cos';

// The full-page stitcher and its chrome-band constants (TOP/BOT, stitch-fullpage.py) left with the
// notification-preferences step on 2026-08-16 — the MFA intro fits one viewport, so nothing here
// scrolls. capture-android-transparency.mjs carried that machinery for the pages that needed it,
// until it was deleted on 2026-08-17 with the captures it wrote; stitch-fullpage.py is still here
// beside this file, and docs/screens/android/README.md records what a rebuilt walker would have to do.

const OTP_PHONE = process.env['E2E_OTP_PHONE'] ?? '0811000010'; // Somsak Duangdee — SITE_WORKER
const OTP_CODE = process.env['E2E_TEST_OTP'] ?? '123456';

const SDK = process.env['ANDROID_HOME'] ?? process.env['ANDROID_SDK_ROOT'] ?? '';
const ADB = SDK
  ? join(SDK, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
  : 'adb';

const adb = (...args) => execFileSync(ADB, args, { maxBuffer: 16 * 1024 * 1024 }).toString();
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function dump() {
  for (let i = 0; i < 12; i++) {
    adb('shell', 'rm', '-f', '/sdcard/ui.xml');
    if (adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml').includes('dumped to')) {
      return adb('shell', 'cat', '/sdcard/ui.xml').split('<');
    }
    await delay(1000);
  }
  throw new Error('capture: uiautomator never produced a dump');
}

function centreOf(node) {
  const m = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node);
  if (!m) throw new Error('capture: node has no bounds');
  return { x: Math.round((+m[1] + +m[3]) / 2), y: Math.round((+m[2] + +m[4]) / 2) };
}

async function find(pred, what, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const node = (await dump()).find((n) => pred(n) && n.includes('bounds='));
    if (node) return centreOf(node);
    await delay(1000);
  }
  throw new Error(`capture: ${what} never appeared`);
}

const byId = (id) => (n) => n.includes(`resource-id="${id}"`);

async function tap(pred, what) {
  const c = await find(pred, what);
  adb('shell', 'input', 'tap', String(c.x), String(c.y));
  await delay(900);
}

async function dismissDevBanners() {
  for (let i = 0; i < 6; i++) {
    const node = (await dump()).find(
      (n) => n.includes('content-desc="!,') && n.includes('clickable="true"'),
    );
    if (!node) return;
    const m = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node);
    if (!m) return;
    adb('shell', 'input', 'tap', String(+m[3] - 58), String(Math.round((+m[2] + +m[4]) / 2)));
    await delay(800);
  }
}

async function keyboardUp() {
  return adb('shell', 'dumpsys', 'input_method').includes('mInputShown=true');
}

async function hideKeyboard() {
  if (!(await keyboardUp())) return;
  adb('shell', 'input', 'keyevent', '111'); // KEYCODE_ESCAPE
  await delay(1200);
}

async function type(text) {
  adb('shell', 'input', 'text', text);
  await delay(600);
}

async function shot(rel) {
  const png = execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
  if (png.length < 20_000) throw new Error(`capture: ${rel} screenshot looks empty`);
  const abs = join(OUT_BASE, `${rel}.png`);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, png);
  console.log(`  saved ${rel}.png (${png.length} bytes)`);
}

/** Open a route by its cos:// deep link (app scheme in app.json). */
function deepLink(path) {
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `cos://${path}`, PKG);
}

async function main() {
  for (const p of ['tcp:8081', 'tcp:3000', 'tcp:8090']) adb('reverse', p, p);

  adb('shell', 'am', 'force-stop', PKG);
  adb('shell', 'pm', 'clear', PKG);
  adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
  console.log(`· app launched, waiting for the JS bundle`);
  await delay(30_000);
  await dismissDevBanners();

  console.log(`· Path A login as ${OTP_PHONE} (SITE_WORKER)`);
  await tap(byId('phone-input'), 'phone input');
  await type(OTP_PHONE);
  await hideKeyboard();
  await tap(byId('request-otp-button'), 'request OTP button');
  await find(byId('otp-input'), 'OTP input');
  await tap(byId('otp-input'), 'OTP input');
  await type(OTP_CODE);
  await hideKeyboard();
  await tap(byId('verify-otp-button'), 'verify OTP button');

  await find(byId('home-screen'), 'home-screen', 40);
  await dismissDevBanners();
  await delay(2000);

  // In-app MFA enrolment intro ("Two-factor authentication" / "Set up authenticator").
  // The drawer and notification-preferences steps that used to run before this one were removed on
  // 2026-08-16 with the frames they wrote — see the header.
  console.log('· MFA enrolment intro');
  deepLink('/mfa-enrollment');
  // The intro is the default state; wait for its "Set up authenticator" CTA (testID) to render.
  await find(byId('mfa-enroll-start'), 'MFA intro (mfa-enroll-start)', 25);
  await dismissDevBanners();
  await delay(1500);
  await shot('02-shared/01-mfa/01-app-intro');

  console.log('done.');
}

main().catch((err) => {
  console.error(String(err.message ?? err));
  process.exit(1);
});
