// Shared app-shell + MFA-intro screenshot capture — adb/uiautomator only (same approach as
// capture-android-home.mjs). Logs in as a SITE_WORKER (Somsak Duangdee, +66811000010 — the role the
// committed navigation-drawer shot uses) and captures the APP screens that previously leaked the
// mfa-enrollment / notifications routes as broken (tofu-icon) bottom tabs. Those routes are now
// href:null in components/MobileNav.tsx, so a fresh capture shows the correct 4-tab bar:
//   docs/screens/android/02-shared/02-navigation-drawer.png     — the drawer (opened from the top bar)
//   docs/screens/android/02-shared/01-notification-preferences.png — the notification-preferences
//     route, stitched as ONE full-length page (PO decision 2026-08-06). It used to be a single
//     viewport plus a hand-made `-quiet` side file holding the rest of the same page; two frames of
//     one screen drift apart, and that one had gone stale by two chrome changes.
//   docs/screens/android/03-mfa/01-app-intro.png           — the in-app MFA enrolment intro
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
const TMP = process.env['TEMP'] ?? process.env['TMP'] ?? HERE;
const STITCH = join(HERE, 'stitch-fullpage.py');

// Fixed chrome bands of the signed-in shell on the Medium_Phone AVD (1080×2400), shared with
// capture-android-transparency.mjs: scrolling content starts at row 311 (below the TopBar and the
// breadcrumb strip) and the bottom nav owns 2210 down. The stitcher drops those bands from every
// frame but the first/last so the bars appear once in a full-page PNG.
const TOP = 311;
const BOT = 2210;

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

/**
 * Rewind to the top, shoot descending viewports, stitch ONE full-page PNG.
 *
 * WHY a scrollable route must not use `shot()`. A single `screencap` is one 2400px viewport, so a
 * page taller than that gets documented as its top third and nothing else. Notification preferences
 * ran that way and the remainder was carried by hand-made side files
 * (`01-notification-preferences-quiet.png`) — the same page, split across frames, going stale on its
 * own schedule: that one still showed the light top bar and the full-width green SyncStatusBar, both
 * gone since 2026-08-04. One stitched page cannot drift out of step with itself.
 *
 * Ported from capture-android-transparency.mjs rather than shared, because these two scripts already
 * keep their own adb/dump helpers and a shared module would be the only thing they import.
 */
async function stitchFull(rel) {
  const dest = join(OUT_BASE, `${rel}.png`);
  mkdirSync(dirname(dest), { recursive: true });
  for (let i = 0; i < 8; i++) {
    adb('shell', 'input', 'swipe', '540', '700', '540', '1900', '300');
    await delay(400);
  }
  await delay(900);
  const SHOTS = 12;
  const shots = [];
  for (let i = 0; i < SHOTS; i++) {
    const png = execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
    if (png.length < 20_000) throw new Error(`capture: ${rel} frame ${i} looks empty`);
    const p = join(TMP, `sm_${rel.replace(/[^a-z0-9]/gi, '_')}_${i}.png`);
    writeFileSync(p, png);
    shots.push(p);
    if (i < SHOTS - 1) {
      adb('shell', 'input', 'swipe', '540', '1800', '540', '1000', '500');
      await delay(1100);
    }
  }
  process.stdout.write(
    execFileSync('python', [STITCH, dest, String(TOP), String(BOT), ...shots], {
      encoding: 'utf-8',
    }),
  );
  console.log(`  stitched ${rel}.png`);
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
  await shot('02-shared/02-navigation-drawer');
  await tap(byId('drawer-backdrop'), 'drawer backdrop (close)');
  await delay(1000);

  // Notification preferences — a shared route reached from the drawer / notifications; deep-linked here.
  console.log('· notification preferences');
  deepLink('/notification-preferences');
  await find(byId('notification-preferences'), 'notification-preferences', 25);
  await dismissDevBanners();
  await delay(1500);
  // Stitched, not `shot()` — this page is ~2× a viewport (channel cards, then QUIET HOURS and Save
  // changes). See stitchFull().
  await stitchFull('02-shared/01-notification-preferences');

  // The post-save confirmation (PO decision 2026-08-06). This step PRESSES SAVE FOR REAL and writes
  // the signed-in user's row in `notification_preferences` — there is no other way to reach the
  // `if (saved)` branch, and the alternative was a hand-made frame that had gone stale by two chrome
  // changes and carried a `fetch failed` toast. It is idempotent and harmless here: nothing was
  // toggled first, so the values written are the ones already on screen, and the account is the
  // capture fixture (Somsak Duangdee), not a real user's.
  //
  // stitchFull() would rewind by swiping, which this screen does not need and cannot survive — it is
  // a short centred panel — so it takes a plain shot().
  console.log('· notification preferences — saved state');
  await tap(byId('prefs-save'), 'SAVE CHANGES');
  await find(byId('prefs-saved-back'), 'saved confirmation (prefs-saved-back)', 20);
  await dismissDevBanners();
  await delay(1200);
  await shot('02-shared/01-notification-preferences-saved');

  // In-app MFA enrolment intro ("Two-factor authentication" / "Set up authenticator").
  console.log('· MFA enrolment intro');
  deepLink('/mfa-enrollment');
  // The intro is the default state; wait for its "Set up authenticator" CTA (testID) to render.
  await find(byId('mfa-enroll-start'), 'MFA intro (mfa-enroll-start)', 25);
  await dismissDevBanners();
  await delay(1500);
  await shot('03-mfa/01-app-intro');

  console.log('done.');
}

main().catch((err) => {
  console.error(String(err.message ?? err));
  process.exit(1);
});
