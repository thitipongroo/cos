// Site Engineer Home screenshot capture — adb/uiautomator only, same approach as
// capture-android-login.mjs (see that file for why Detox cannot drive these flows).
//
// Writes docs/screens/android/21-site-engineer-home.png: the SITE_ENGINEER landing dashboard
// (mockup/site-engineer/dashboard-mobile/) with live data — BOQ-value-weighted project progress
// (§32.12), open issues, and upcoming tasks — reached through a real Path A (SMS OTP) login.
//
// Prerequisites (all must already be running):
//   - emulator booted, debug app installed. A debug APK loads its JS from Metro, so it does NOT need
//     rebuilding when only JS/asset code changed.
//   - Metro:    EXPO_PUBLIC_API_URL=http://localhost:3001/api/v1 npx expo start
//   - backend with E2E_AUTH_BYPASS=true on :3001 (fixed OTP), Kafka up (the backend exits without it)
//   - database seeded with backend/prisma/seed-realistic.ts and users provisioned into Keycloak with
//     backend/prisma/provision-keycloak-demo.ts (that script gives phone-holders a phone username,
//     which is what makes Path A possible at all)
//   - adb reverse tcp:8081/tcp:3001/tcp:8090 (this script re-asserts them)
// Run: node scripts/capture-android-home.mjs

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../../docs/screens/android');
const PKG = 'com.constructionos.cos';

// Waraporn Klinhom — SITE_ENGINEER at Ekachai (seed-realistic.ts), the engineer the R9CT tasks are
// assigned to. National format: the login screen prefixes +66 from the country picker.
const OTP_PHONE = process.env['E2E_OTP_PHONE'] ?? '0811000009';
const OTP_CODE = process.env['E2E_TEST_OTP'] ?? '123456';
// The dashboard now matches its mockup (PO 2026-07-25 full parity), which has no project picker — the
// screen auto-selects the active project from the offline cache, so there is no chip to tap.

const SDK = process.env['ANDROID_HOME'] ?? process.env['ANDROID_SDK_ROOT'] ?? '';
const ADB = SDK
  ? join(SDK, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
  : 'adb';

const adb = (...args) => execFileSync(ADB, args, { maxBuffer: 16 * 1024 * 1024 }).toString();
const docker = (...args) => execFileSync('docker', args).toString();
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// CAPTURE_LOADING=1 → capture the dashboard's <LoadingState /> skeletons (ADR-055) instead of the
// loaded screen: pause Postgres so the data fetches hang, relaunch, and photograph the skeletons.
const LOADING_MODE = process.env['CAPTURE_LOADING'] === '1';

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

async function find(pred, what, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const node = (await dump()).find((n) => pred(n) && n.includes('bounds='));
    if (node) return centreOf(node);
    await delay(1000);
  }
  throw new Error(`capture: ${what} never appeared`);
}

const byId = (id) => (n) => n.includes(`resource-id="${id}"`);
const byText = (t) => (n) => n.includes(`text="${t}"`);

async function present(pred) {
  return (await dump()).some((n) => pred(n) && n.includes('bounds='));
}

async function tap(pred, what) {
  const c = await find(pred, what);
  adb('shell', 'input', 'tap', String(c.x), String(c.y));
  await delay(900);
}

/** RN's LogBox notification ("Open debugger to view warnings.") — debug-only, keep it out of docs. */
async function dismissDevBanners() {
  for (let i = 0; i < 6; i++) {
    const node = (await dump()).find(
      (n) => n.includes('content-desc="!,') && n.includes('clickable="true"'),
    );
    if (!node) return;
    const m = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node);
    if (!m) return;
    // The dismiss X is an unlabelled child at the banner's right edge.
    adb('shell', 'input', 'tap', String(+m[3] - 58), String(Math.round((+m[2] + +m[4]) / 2)));
    await delay(800);
  }
}

/**
 * Gboard shows one-time onboarding ("Try out your stylus") the first time it opens on a fresh
 * emulator, and it covers the screen — it silently replaced the OTP screen in an earlier run.
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

async function keyboardUp() {
  return adb('shell', 'dumpsys', 'input_method').includes('mInputShown=true');
}

/**
 * Close the soft keyboard with ESC, not BACK. BACK only stops at the IME while it is really showing,
 * and `mInputShown` goes stale — a BACK sent on a stale reading falls through to the activity, which
 * on the root login route quits the app. ESC is a no-op for the RN screen, so a wrong guess is free.
 */
async function hideKeyboard() {
  if (!(await keyboardUp())) return;
  adb('shell', 'input', 'keyevent', '111'); // KEYCODE_ESCAPE
  await delay(1200);
}

async function type(text) {
  adb('shell', 'input', 'text', text);
  await delay(600);
  await dismissImeOnboarding();
}

async function shot(name) {
  const png = execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
  // A PNG that small is a black/blank frame, not a screen.
  if (png.length < 20_000) throw new Error(`capture: ${name} screenshot looks empty`);
  writeFileSync(join(OUT, `${name}.png`), png);
  console.log(`  saved ${name}.png (${png.length} bytes)`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  for (const p of ['tcp:8081', 'tcp:3001', 'tcp:8090']) adb('reverse', p, p);

  // Fresh start: pm clear drops the offline DB + any stored session, so the run always begins at the
  // login screen rather than resuming someone else's.
  adb('shell', 'am', 'force-stop', PKG);
  adb('shell', 'pm', 'clear', PKG);
  adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
  console.log('· app launched, waiting for the JS bundle');
  await delay(30_000);
  await dismissDevBanners();

  console.log(`· Path A login as ${OTP_PHONE} (TH national format)`);
  await tap(byId('phone-input'), 'phone input');
  await type(OTP_PHONE);
  await hideKeyboard();
  await tap(byId('request-otp-button'), 'request OTP button');

  await find(byId('otp-input'), 'OTP input');
  await tap(byId('otp-input'), 'OTP input');
  await type(OTP_CODE);
  await hideKeyboard();
  await tap(byId('verify-otp-button'), 'verify OTP button');

  console.log('· waiting for the Site Engineer Home');
  // Asserting the testID (not a fixed sleep) is what stops a mis-tap from being photographed: if the
  // app landed anywhere else, this throws instead of saving a screenshot of the wrong screen.
  await find(byId('site-engineer-home'), 'site-engineer-home', 40);
  await dismissDevBanners();

  if (LOADING_MODE) {
    // Hold the loading state for the screenshot: pause Postgres so the dashboard's data fetches hang,
    // then relaunch. The session survives a force-stop (only `pm clear` wipes it), so the app opens
    // straight to the dashboard, whose GET /projects/mine + progress calls now hang — leaving the
    // LoadingState skeletons (ADR-055) on screen to photograph.
    console.log('· pausing postgres + relaunching to hold the loading state');
    docker('pause', 'cos-postgres');
    try {
      adb('shell', 'am', 'force-stop', PKG);
      adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
      // The dashboard re-mounts with GET /projects/mine hanging (postgres paused), so its
      // <LoadingState /> skeletons (ADR-055) show for ~15s (the app's HTTP timeout) before the fetch
      // errors and the empty state replaces them. The skeletons animate continuously, so uiautomator
      // cannot dump them ("could not get idle state") — screencap the framebuffer directly on a fixed
      // delay that lands after the JS bundle + mount but well inside the ~15s skeleton window.
      await delay(15_000);
      // Dismiss the debug-only LogBox toast ("Open debugger to view warnings.") by tapping its X.
      // uiautomator can't be used here (the skeleton animates → "could not get idle state"), so the
      // coordinate is fixed for this AVD (Medium_Phone 1080×2400): the toast X sits bottom-right.
      adb('shell', 'input', 'tap', '1012', '2236');
      await delay(1500);
      await shot('22-site-engineer-loading');
    } finally {
      docker('unpause', 'cos-postgres');
    }
    console.log('done (loading).');
    return;
  }

  // No picker anymore: the screen auto-selects the active project from local_projects (populated by
  // the shell's delta-sync + the screen's own refreshProjectsCache), then fetches its progress /
  // issues / tasks. Give the cache + auto-select + those fetches time to land.
  console.log('· waiting for the auto-selected project data');
  await delay(6000);
  await dismissDevBanners();

  // The card only renders a figure when the metric is computable (§32.12). If the placeholder is on
  // screen the data is wrong, and a screenshot of an empty card documents nothing — fail loudly.
  if (await present(byId('progress-empty'))) {
    throw new Error(
      'capture: progress card shows the "no BOQ-linked task" placeholder — check that ' +
        'seed-realistic.ts linked tasks to BOQ items and that the picked project has them',
    );
  }
  await find(byId('progress-pct'), 'progress percentage');

  await shot('21-site-engineer-home');
  console.log('done.');
}

main().catch((err) => {
  console.error(String(err.message ?? err));
  process.exit(1);
});
