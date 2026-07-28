// Shared app-shell + MFA-intro screenshot capture — adb/uiautomator only (same approach as
// capture-android-home.mjs). Logs in as a SITE_WORKER (Somsak Duangdee, +66811000010 — the role the
// committed navigation-drawer shot uses) and captures the APP screens that previously leaked the
// mfa-enrollment / notifications routes as broken (tofu-icon) bottom tabs. Those routes are now
// href:null in components/MobileNav.tsx, so a fresh capture shows the correct 4-tab bar:
//   docs/screens/android/_shared/02-navigation-drawer.png     — the drawer (opened from the top bar)
//   docs/screens/android/_shared/01-notification-preferences.png — the notification-preferences route
//   docs/screens/android/_mfa-flow/01-app-intro.png           — the in-app MFA enrolment intro
// The Keycloak browser steps of the MFA flow (02–07) are captured by hand; this script covers only the
// in-app screens it can drive. Prereqs are the same as capture-android-home.mjs, plus Metro started
// with EXPO_PUBLIC_CAPTURE=1 so the dev-only LogBox toast is suppressed (see src/app/_layout.tsx).
// Run: node scripts/capture-android-shared-mfa.mjs

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_BASE = resolve(HERE, '../../../docs/screens/android');
const PKG = 'com.constructionos.cos';

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

async function present(pred) {
  const node = (await dump()).find((n) => pred(n) && n.includes('bounds='));
  return Boolean(node);
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

  // Navigation drawer — opened from the top bar. The trigger is the hamburger on the light shell
  // (drawer-menu-button) or the brand icon on the dark shell (brand-logo); try the hamburger first.
  console.log('· navigation drawer');
  if (await present(byId('drawer-menu-button'))) {
    await tap(byId('drawer-menu-button'), 'drawer menu button');
  } else {
    await tap(byId('brand-logo'), 'brand logo (drawer trigger)');
  }
  await find(byId('drawer-logout'), 'drawer open (logout button)', 15);
  await delay(1200);
  await shot('_shared/02-navigation-drawer');
  await tap(byId('drawer-backdrop'), 'drawer backdrop (close)');
  await delay(1000);

  // Notification preferences — a shared route reached from the drawer / notifications; deep-linked here.
  console.log('· notification preferences');
  deepLink('/notification-preferences');
  await find(byId('notification-preferences'), 'notification-preferences', 25);
  await dismissDevBanners();
  await delay(1500);
  await shot('_shared/01-notification-preferences');

  // In-app MFA enrolment intro ("Two-factor authentication" / "Set up authenticator").
  console.log('· MFA enrolment intro');
  deepLink('/mfa-enrollment');
  // The intro is the default state; wait for its "Set up authenticator" CTA (testID) to render.
  await find(byId('mfa-enroll-start'), 'MFA intro (mfa-enroll-start)', 25);
  await dismissDevBanners();
  await delay(1500);
  await shot('_mfa-flow/01-app-intro');

  console.log('done.');
}

main().catch((err) => {
  console.error(String(err.message ?? err));
  process.exit(1);
});
