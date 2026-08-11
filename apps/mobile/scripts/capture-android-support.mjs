// Android Support Center screenshot capture — adb/uiautomator only, same approach as the sibling
// capture-android-*.mjs scripts (deliberately NOT Detox; see capture-android-login.mjs for why).
//
// Writes the pre-auth Support Center to docs/screens/android/01-authen/05-get-support/. It is a PUBLIC
// screen — it lives in the (auth) route group and is reached from the OTP step's GET SUPPORT footer
// item — so it sits with the other 01-authen/ captures, in its own numbered subfolder:
//   01-get-support  default state — all four troubleshooting topics collapsed, as the screen opens
//
// BACKEND REQUIRED, unlike the Privacy Policy and Terms of Use captures next door. Not because the
// screen needs it — it needs it to be REACHED. The only entry the mockups draw for this screen is on
// the OTP step (02_login_otp_verification_mobile), and getting there means requesting a passcode,
// which is a real API call. The screen's own system-status banner then probes GET /health/live, so a
// backend-less run would also capture a red "system unreachable" state rather than the normal one.
//
// The two emergency controls capture as DISABLED whenever EXPO_PUBLIC_SUPPORT_CENTER_PHONE and
// EXPO_PUBLIC_SUPPORT_IT_HOTLINE are unset, which is the repo default — no numbers are invented for
// a screenshot. Set them in apps/mobile/.env and re-run to capture the configured state.
//
// Prerequisites:
//   - docker compose up (postgres, keycloak, …) and the backend on :3000
//   - emulator booted, debug app installed (android/app/build/outputs/apk/debug/app-debug.apk)
//   - Metro: EXPO_PUBLIC_CAPTURE=1 npx expo start
//     EXPO_PUBLIC_CAPTURE=1 matters — it mutes the dev LogBox toast and freezes animation loops, so a
//     capture is deterministic. Expo inlines EXPO_PUBLIC_* at Metro start, so it must be set THERE.
//   - adb reverse tcp:8081 + tcp:3000 (this script re-asserts both)
// Run: node scripts/capture-android-support.mjs

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../../docs/screens/android/01-authen/05-get-support');
const TMP = process.env['TEMP'] ?? process.env['TMP'] ?? HERE;
const STITCH = join(HERE, 'stitch-fullpage.py');
const PKG = 'com.constructionos.cos';

// Any seeded phone reaches the OTP step; same default as capture-android-login.mjs.
const OTP_PHONE = process.env['E2E_OTP_PHONE'] ?? '0811000010';

// Fixed bands on this screen, measured on the Medium_Phone AVD (1080×2400):
//   rows 0..199   status bar + the screen's own top bar; its bottom border is rows 198–199
//   rows 2350..   Android's gesture pill (system UI drawn over the app; identical in every shot)
// Everything between scrolls. There is no action bar and no bottom nav — this is a pre-auth route,
// and the drawing's Field | Tasks | Support | Profile bar does not exist before sign-in.
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

/**
 * Tap, then prove the tap LANDED — retrying if it did not.
 *
 * Same race the Privacy Policy and Terms of Use captures document: `app/_layout.tsx` mounts its
 * children underneath the launch loader, so uiautomator reports a control while the gate is still
 * closed and the first tap is swallowed.
 */
async function tapUntil(id, expectId, what, tries = 6) {
  for (let attempt = 0; attempt < tries; attempt++) {
    await tap(byId(id), what);
    await delay(1200);
    const arrived = (await dump()).some((n) => n.includes(`resource-id="${expectId}"`));
    if (arrived) return;
  }
  throw new Error(`capture: ${what} did not open ${expectId} after ${tries} taps`);
}

/**
 * Gboard shows one-time onboarding the first time it opens on a fresh emulator and covers the screen.
 * Same guard as capture-android-login.mjs, where it once silently replaced the OTP screen.
 */
async function dismissImeOnboarding() {
  for (const label of ['Cancel', 'Got it', 'No thanks', 'Done']) {
    const node = (await dump()).find((n) => n.includes(`text="${label}"`) && n.includes('bounds='));
    if (!node) continue;
    const c = centreOf(node);
    adb('shell', 'input', 'tap', String(c.x), String(c.y));
    await delay(1200);
    return;
  }
}

/** ESC, not BACK: BACK on a stale `mInputShown` reading falls through and quits the app. */
async function hideKeyboard() {
  if (!adb('shell', 'dumpsys', 'input_method').includes('mInputShown=true')) return;
  adb('shell', 'input', 'keyevent', '111'); // KEYCODE_ESCAPE
  await delay(1200);
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
  const SHOTS = 12;
  const shots = [];
  for (let i = 0; i < SHOTS; i++) {
    const p = join(TMP, `sup_${name.replace(/[^a-z0-9]/gi, '_')}_${i}.png`);
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
  adb('reverse', 'tcp:3000', 'tcp:3000');

  // Fresh start: pm clear drops any stored session so the app lands on the login screen.
  adb('shell', 'pm', 'clear', PKG);
  adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
  await find(byId('phone-input'), 'login screen');

  // Reach the OTP step — the only place the mockups put a GET SUPPORT entry.
  console.log('walking login → OTP step');
  await tap(byId('country-picker'), 'country picker');
  await tap(byId('country-option-th'), 'Thailand option');
  await tap(byId('phone-input'), 'phone input');
  adb('shell', 'input', 'text', OTP_PHONE);
  await delay(600);
  await dismissImeOnboarding();
  await hideKeyboard();
  await tap(byId('request-otp-button'), 'request OTP button');
  await find(byId('otp-input'), 'OTP step'); // proves the passcode step really rendered

  await tapUntil('get-support-link', 'support', 'GET SUPPORT footer link');
  await delay(900); // let the health probe answer, so the banner is not captured mid-check
  await stitchFull('01-get-support');

  console.log(`\nDone → ${OUT}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
