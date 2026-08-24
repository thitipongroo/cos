// Site Engineer TAB screenshot capture — Issues, Tasks, Reports.
//
// The sibling of capture-android-home.mjs, which shoots this role's project picker and Home tab.
// Everything below the login is the same harness (adb + uiautomator; see capture-android-login.mjs
// for why Detox cannot drive these flows) — what differs is that this one walks the bottom nav.
//
// It exists because those three screens were photographed BY HAND with ad-hoc adb calls when they
// were first rebuilt, which is not repeatable and cannot be re-run after a change. Each is now
// asserted by its own testID before the shutter, so a mis-tap fails the run instead of filing a
// screenshot of the wrong screen.
//
// Writes one full-page PNG each (see withShrunkScreen for why they are not stitched):
//   docs/screens/android/03-site-engineer/02-Issues/01-se-issue-dashboard.png
//   docs/screens/android/03-site-engineer/03-Tasks/01-se-tasks.png
//   docs/screens/android/03-site-engineer/04-Reports/01-se-reports.png
// against mockup/mobile/03_site_engineer/{02_issues,03_tasks,04_reports}.
//
// Prerequisites — identical to capture-android-home.mjs, and that file documents them in full:
//   emulator booted with the debug app installed · Metro on :8081 · backend with E2E_AUTH_BYPASS=true
//   on :3000 · Kafka up · database seeded (seed-realistic.ts) and users provisioned into Keycloak
//   (provision-keycloak-demo.ts, which is what makes the Path A phone login possible).
// Run: node scripts/capture-android-site-engineer-tabs.mjs

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCREENS = resolve(HERE, '../../../docs/screens/android/03-site-engineer');
const PKG = 'com.constructionos.cos';

// Waraporn Klinhom — SITE_ENGINEER at Ekachai (seed-realistic.ts), the same engineer the Home
// capture signs in as, so both runs document the same person's data.
const OTP_PHONE = process.env['E2E_OTP_PHONE'] ?? '0811000009';
const OTP_CODE = process.env['E2E_TEST_OTP'] ?? '123456';

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

async function find(pred, what, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const node = (await dump()).find((n) => pred(n) && n.includes('bounds='));
    if (node) return centreOf(node);
    await delay(1000);
  }
  throw new Error(`capture: ${what} never appeared`);
}

const byId = (id) => (n) => n.includes(`resource-id="${id}"`);

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

function screencap() {
  const png = execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
  if (png.length < 20_000) throw new Error('capture: screenshot looks empty');
  return png;
}

function grab(path) {
  writeFileSync(path, screencap());
}

/**
 * FULL PAGE BY SHRINKING THE SCREEN, NOT BY SCROLLING IT.
 *
 * The Home capture stitches descending viewports, and that works there because its page is one
 * full-screen ScrollView. It does not work here, and four attempts to make it work are the reason
 * this exists: `adb shell input swipe` moves the Issues board (a ScrollView) and does not move the
 * Tasks or Reports lists at all. The failure is silent in both directions — the swipe always
 * "succeeds", and a verify step that diffs uiautomator dumps or even raw frames reports movement
 * that is really the status-bar clock ticking or a card's own press highlight flashing under the
 * finger. Three runs were filed as full pages with most of the list missing before that was pinned
 * down by hashing frames with the top quarter excluded.
 *
 * Lowering the display density puts the whole page in one frame instead, so there is no gesture to
 * get wrong and no seam to stitch. The pixels are the app's real output at a real density — a phone
 * set to a smaller display size shows exactly this — so the screenshot documents the layout rather
 * than a montage of it.
 *
 * ALWAYS RESTORED, in a finally: leaving a developer's emulator at a density they did not choose is
 * the kind of side effect that gets blamed on something else a week later.
 */
const CAPTURE_DENSITY = '260';

async function withShrunkScreen(fn) {
  adb('shell', 'wm', 'density', CAPTURE_DENSITY);
  // The app re-lays out on a density change, and RN needs a moment to finish it.
  await delay(4000);
  try {
    await fn();
  } finally {
    adb('shell', 'wm', 'density', 'reset');
    await delay(3000);
  }
}

async function shoot(dir, name) {
  const out = resolve(SCREENS, dir);
  mkdirSync(out, { recursive: true });
  const file = join(out, `${name}.png`);
  grab(file);
  console.log(`  saved ${dir}/${name}.png`);
}

/**
 * Move to a bottom-nav tab and prove we arrived.
 *
 * The tab is found by its testID rather than by a screen fraction: SITE_ENGINEER's bar is
 * Home | Issues | Tasks | Reports today, and it has been reordered twice — a hardcoded x would keep
 * "working" while photographing the wrong screen.
 */
async function openTab(tab, screenId) {
  console.log(`· opening the ${tab} tab`);
  // `<name>-tab`, the id MobileNav puts on every bar button (tabBarButtonTestID).
  await tap(byId(`${tab}-tab`), `${tab} tab`);
  await find(byId(screenId), screenId, 30);
  await dismissDevBanners();
  // The tab screens all fetch on mount (issues + tasks read the local DB, reports hits the network,
  // and each of the three carries an AI panel that is a separate call). Give those a moment so the
  // shot shows the loaded page rather than a skeleton.
  await delay(6000);
  await dismissDevBanners();
}

async function main() {
  for (const p of ['tcp:8081', 'tcp:3000', 'tcp:8090']) adb('reverse', p, p);

  // Fresh start: pm clear drops the offline DB + any stored session, so the run always begins at the
  // login screen rather than resuming someone else's. It also forces the local DDL to be rebuilt at
  // its current version, which is what puts the newest columns (v6: issue_type + created_at) on the
  // issue rows these shots are meant to document.
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

  // The picker opens over the dashboard on the first launch after a login (<SelectProjectSheet /> is
  // mounted for this role since 2026-08-12). Every screen below is project-scoped — the Active
  // Project bar, both AI panels and the issue list all render nothing without one — so this is
  // answered before anything is photographed, not skipped.
  // Optional, not assumed: a session that already has a project chosen shows no overlay.
  //
  // POLLED, NOT PROBED ONCE — the shell mounts the dashboard first and raises the overlay a beat
  // later, and uiautomator refuses to dump mid-transition ("could not get idle state"), so a single
  // check reads the dashboard and skips the picker. See the same note in capture-android-home.mjs.
  let pickerUp = false;
  for (let i = 0; i < 20 && !pickerUp; i++) {
    if (await present(byId('select-project-screen'))) {
      pickerUp = true;
      break;
    }
    if (await present(byId('site-engineer-home'))) break; // already chosen — no overlay to answer
    await delay(1000);
  }

  if (pickerUp) {
    console.log('· answering the project picker');
    // The FIRST project row. Its testID carries the project's own uuid (`select-project-<id>`),
    // which no fixture pins, so it is matched by prefix rather than by a hardcoded id.
    await tap(
      (n) => /resource-id="select-project-[0-9a-f-]{36}"/.test(n),
      'first project in the picker',
    );
  }

  // Land on Home first: it is where the login drops the engineer, and reaching the other tabs from
  // anywhere else would not be the journey a person takes.
  await find(byId('site-engineer-home'), 'site-engineer-home', 40);
  await dismissDevBanners();

  // Delta sync populates local_issues and local_tasks in the background — the Issues and Tasks tabs
  // read those tables, so give the first pull time to land before walking to them. Without this the
  // boards photograph as empty on a freshly cleared install.
  console.log('· waiting for the first delta sync');
  await delay(12_000);

  await withShrunkScreen(async () => {
    await openTab('issues', 'issues-screen');
    await shoot('02-Issues', '01-se-issue-dashboard');

    await openTab('tasks', 'tasks-screen');
    await shoot('03-Tasks', '01-se-tasks');

    await openTab('reports', 'reports-screen');
    await shoot('04-Reports', '01-se-reports');
  });

  console.log('done.');
}

main().catch((err) => {
  console.error(String(err.message ?? err));
  process.exit(1);
});
