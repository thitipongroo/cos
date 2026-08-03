// Android Privacy Policy screenshot capture — adb/uiautomator only, same approach as the sibling
// capture-android-*.mjs scripts (deliberately NOT Detox; see capture-android-login.mjs for why).
//
// Writes the pre-auth Privacy Policy screen to docs/screens/android/01-public/. It is a PUBLIC screen:
// it is reached from the login footer and lives in the (auth) route group, so it sits with the other
// pre-auth captures (00-native-splash … 04-login-loading):
//   05-privacy-policy                  default state — all five sections collapsed, as the screen opens
//   05-privacy-policy-data-collection  Data Collection expanded — the alternate state that shows the
//                                      actual policy text (same number as its base screen, matching how
//                                      03-login-otp-verify / 03-login-password are numbered)
//
// NO BACKEND REQUIRED. Unlike every other capture script here, this screen makes no API call — it
// renders from the i18n bundle and the app icon only — so Keycloak/NestJS/Postgres do not need to be
// running and no login is performed. Metro alone is enough. (The login screen it launches into shows a
// red health dot without a backend; that screen is not captured here.)
//
// Prerequisites:
//   - emulator booted, debug app installed (android/app/build/outputs/apk/debug/app-debug.apk)
//   - Metro: EXPO_PUBLIC_CAPTURE=1 npx expo start
//     EXPO_PUBLIC_CAPTURE=1 matters — it mutes the dev LogBox toast and freezes animation loops, so a
//     capture is deterministic. Expo inlines EXPO_PUBLIC_* at Metro start, so it must be set THERE,
//     not here.
//   - adb reverse tcp:8081 (this script re-asserts it)
// Run: node scripts/capture-android-privacy-policy.mjs

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../../docs/screens/android/01-public');
const TMP = process.env['TEMP'] ?? process.env['TMP'] ?? HERE;
const STITCH = join(HERE, 'stitch-fullpage.py');
const PKG = 'com.constructionos.cos';

// Fixed bands on this screen, measured on the Medium_Phone AVD (1080×2400):
//   rows 0..199    status bar + the app's top bar; its bottom border is rows 197–199
//   rows 2350..    Android's gesture pill (system UI drawn over the app; identical in every shot)
// Everything between scrolls. The screen has no bottom nav of its own — it is a pre-auth route.
const TOP = 200;
const BOT = 2350;

const SDK = process.env['ANDROID_HOME'] ?? process.env['ANDROID_SDK_ROOT'] ?? '';
const ADB = SDK
  ? join(SDK, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
  : 'adb';

const adb = (...args) => execFileSync(ADB, args, { maxBuffer: 16 * 1024 * 1024 }).toString();
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A dump only succeeds once the window is idle; mid-transition it fails with
 *   ERROR: null root node returned by UiTestAutomationBridge.
 * and leaves the previous /sdcard/ui.xml in place, so a naive read silently returns the *last*
 * screen. Delete first, and trust the file only when the tool says it wrote one.
 */
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

async function find(pred, what, tries = 30) {
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

/** Fail loudly rather than committing a screenshot of the wrong screen. */
async function assertOn(id, what) {
  await find(byId(id), what);
}

function grab(path) {
  const png = execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
  if (png.length < 20_000) throw new Error(`capture: ${path} screenshot looks empty`);
  writeFileSync(path, png);
}

/**
 * Rewind to the top, then shoot descending viewports and stitch ONE full-page PNG via
 * scripts/stitch-fullpage.py (docs/screens/android/README.md: every committed screen is one
 * full-page image).
 */
async function stitchFull(name) {
  const dest = join(OUT, `${name}.png`);
  mkdirSync(dirname(dest), { recursive: true });
  for (let i = 0; i < 8; i++) {
    adb('shell', 'input', 'swipe', '540', '700', '540', '1900', '300');
    await delay(500);
  }
  await delay(900);
  // Short scroll steps (800px against a 2150px content window) on purpose. A 1200px step left the
  // stitcher only ~950px of overlap to match on, and on the expanded Data Collection section — a wall
  // of similar-looking body text — it mis-matched and dropped a whole bullet ("Site photos") at the
  // seam. More, smaller steps cost a few seconds and make the match unambiguous. SHOTS is generous;
  // once the bottom is reached the extra frames are detected as zero-scroll and skipped.
  const SHOTS = 12;
  const shots = [];
  for (let i = 0; i < SHOTS; i++) {
    const p = join(TMP, `pp_${name.replace(/[^a-z0-9]/gi, '_')}_${i}.png`);
    grab(p);
    shots.push(p);
    if (i < SHOTS - 1) {
      adb('shell', 'input', 'swipe', '540', '1800', '540', '1000', '500');
      await delay(1200);
    }
  }
  process.stdout.write(
    execFileSync('python', [STITCH, dest, String(TOP), String(BOT), ...shots], {
      encoding: 'utf-8',
    }),
  );
  console.log(`  stitched ${name}.png`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  adb('reverse', 'tcp:8081', 'tcp:8081');

  // Fresh start: pm clear drops any stored session so the app always lands on the login screen, which
  // is where the Privacy Policy link lives.
  adb('shell', 'pm', 'clear', PKG);
  adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
  await assertOn('privacy-policy-link', 'login screen');

  await tap(byId('privacy-policy-link'), 'Privacy Policy footer link');
  await assertOn('privacy-policy', 'Privacy Policy screen');
  await delay(600);
  await stitchFull('05-privacy-policy');

  // Alternate state: Data Collection expanded. The collapsed screen shows only section headings, so
  // without this the captures never show the policy text itself.
  await tap(byId('privacy-section-collection'), 'Data Collection accordion');
  await assertOn('privacy-section-collection-body', 'expanded Data Collection body');
  await delay(600);
  await stitchFull('05-privacy-policy-data-collection');

  console.log(`\nDone → ${OUT}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
