// Site Engineer Home screenshot capture — adb/uiautomator only, same approach as
// capture-android-login.mjs (see that file for why Detox cannot drive these flows).
//
// Writes docs/screens/android/03-site-engineer/01-Home/01-se-home-dashboard.png: the SITE_ENGINEER landing dashboard
// (mockup/mobile/03_site_engineer/01_home/01_se_home_dashboard/) with live data — BOQ-value-weighted project progress
// (§32.12), open issues, and upcoming tasks — reached through a real Path A (SMS OTP) login.
//
// Prerequisites (all must already be running):
//   - emulator booted, debug app installed. A debug APK loads its JS from Metro, so it does NOT need
//     rebuilding when only JS/asset code changed.
//   - Metro:    EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1 npx expo start
//   - backend with E2E_AUTH_BYPASS=true on :3000 (fixed OTP), Kafka up (the backend exits without it)
//   - database seeded with backend/prisma/seed-realistic.ts and users provisioned into Keycloak with
//     backend/prisma/provision-keycloak-demo.ts (that script gives phone-holders a phone username,
//     which is what makes Path A possible at all)
//   - adb reverse tcp:8081/tcp:3000/tcp:8090 (this script re-asserts them)
// Run: node scripts/capture-android-home.mjs

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// Grouped by main-menu tab: SITE_ENGINEER's loading + landing shots are its Home tab → 03-site-engineer/01-Home/.
const OUT = resolve(HERE, '../../../docs/screens/android/03-site-engineer/01-Home');
const TMP = process.env['TEMP'] ?? process.env['TMP'] ?? HERE; // scratch for the intermediate viewports
const STITCH = join(HERE, 'stitch-fullpage.py');
const PKG = 'com.constructionos.cos';

// Waraporn Klinhom — SITE_ENGINEER at Ekachai (seed-realistic.ts), the engineer the R9CT tasks are
// assigned to. National format: the login screen prefixes +66 from the country picker.
const OTP_PHONE = process.env['E2E_OTP_PHONE'] ?? '0811000009';
const OTP_CODE = process.env['E2E_TEST_OTP'] ?? '123456';
// The dashboard shows the Active Project BAR, not a picker (PO 2026-08-12): the project is chosen
// once in <SelectProjectSheet />, which the shell now raises for this role, and the bar names it.
// The run below answers that overlay when it appears — see the note at the call site.

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

function grab(path) {
  const png = execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
  if (png.length < 20_000) throw new Error(`capture: ${path} screenshot looks empty`);
  writeFileSync(path, png);
}
/**
 * Rewind to the top, then shoot descending viewports and stitch one full-page PNG via
 * scripts/stitch-fullpage.py. bot=1970 sits above the floating mic FAB + bottom nav, so those fixed
 * elements are appended once from the last shot's [bot:] slice instead of repeating down the page.
 */
async function stitchFull(name, top = 180, bot = 1970) {
  mkdirSync(OUT, { recursive: true });
  for (let i = 0; i < 5; i++) {
    adb('shell', 'input', 'swipe', '540', '700', '540', '1700', '300');
    await delay(500);
  }
  await delay(700);
  const shots = [];
  for (let i = 0; i < 6; i++) {
    const p = join(TMP, `se_${i}.png`);
    grab(p);
    shots.push(p);
    if (i < 5) {
      adb('shell', 'input', 'swipe', '540', '1700', '540', '650', '500');
      await delay(1200);
    }
  }
  const out = join(OUT, `${name}.png`);
  process.stdout.write(execFileSync('python', [STITCH, out, String(top), String(bot), ...shots], { encoding: 'utf-8' }));
  console.log(`  stitched ${name}.png`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  for (const p of ['tcp:8081', 'tcp:3000', 'tcp:8090']) adb('reverse', p, p);

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

  // ANSWER THE PROJECT PICKER FIRST (2026-08-12). The engineer used to land straight on the
  // dashboard, which silently auto-selected the first ACTIVE project. Selection now lives in
  // `projectStore` and <SelectProjectSheet /> is mounted for this role too, so the first launch after
  // a login opens the picker OVER the dashboard — and `site-engineer-home` is behind it. Waiting for
  // that testID without answering the overlay is what made this script fail with
  // "site-engineer-home never appeared" against a perfectly healthy app.
  //
  // Optional, not assumed: a session that already has a project chosen goes straight to the
  // dashboard and no overlay appears, so this is skipped rather than waited for.
  //
  // POLLED, NOT PROBED ONCE. A single dump here is a race the script loses more often than not: the
  // shell mounts the dashboard first and raises the overlay a beat later, and uiautomator refuses to
  // dump at all mid-transition ("could not get idle state"). The first successful dump therefore
  // lands on the dashboard, the check reads false, the picker is never answered — and the run dies
  // 40 seconds later on "site-engineer-home never appeared", pointing at the wrong thing entirely.
  // Polling for EITHER surface ends the moment one of them is really there.
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
    await dismissDevBanners();
    // The picker is worth documenting in its own right — it is the first screen an engineer with no
    // site chosen sees, and it carries the progress bar and the Recommended panel. ONE viewport, not
    // a stitch: it is a centred dialog capped at 90% of the screen, so the whole of it is on screen
    // at once, and stitching a modal whose header stays put while its body scrolls would repeat the
    // header down the page.
    await delay(2500); // let GET /projects/mine land, so the cards show real names and progress
    mkdirSync(OUT, { recursive: true });
    // SHRINK THE SCREEN FOR THE SHOT, the same way capture-android-site-engineer-tabs.mjs does and
    // for the same reason: the sheet is a scrolling dialog, and its recommendation panel plus the
    // project list no longer fit one viewport at the device's own density. A lower density puts the
    // whole sheet in one frame — real output at a real density, not a montage. Restored in the
    // `finally` so the emulator is never left changed.
    adb('shell', 'wm', 'density', '260');
    try {
      // WAIT FOR THE SHEET TO COME BACK, do not just sleep. A density change makes Android recreate
      // the activity, so the React Native app REMOUNTS — it returns to its launch splash and takes
      // however long the bundle needs to come up again. A fixed 4s delay here photographed
      // "Loading… 50%" and filed it as the project picker. Asserting the testID waits exactly as
      // long as it needs to and fails loudly if the sheet never returns, instead of quietly saving
      // whatever happens to be on screen.
      await find(byId('select-project-screen'), 'select-project-screen after resize', 40);
      await dismissDevBanners();
      await delay(2500); // GET /projects/mine again, so the cards show names and progress
      grab(join(OUT, '00-se-project-selection.png'));
      console.log('  saved 00-se-project-selection.png');
    } finally {
      adb('shell', 'wm', 'density', 'reset');
      await delay(3000);
    }

    console.log('· answering the project picker');
    // The FIRST project row. Its testID carries the project's own uuid (`select-project-<id>`), which
    // no fixture pins, so it is matched by prefix rather than by a hardcoded id.
    await tap(
      (n) => /resource-id="select-project-[0-9a-f-]{36}"/.test(n),
      'first project in the picker',
    );
  }

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
      // errors and the empty state replaces them. The screen is taller than the viewport (Upcoming Tasks
      // sits below the fold), so capture it as ONE full-page image — but FAST, to stay inside that
      // window: no rewind (it re-mounts at the top) and only a couple of scroll steps (the dashboard is
      // ~1.3 viewports). The skeletons animate, so uiautomator can't dump them — screencap the
      // framebuffer directly and let the stitch match on the static skeleton structure.
      await delay(14_000); // bundle re-mounted + skeletons showing (mount takes ~12s on relaunch)
      // No LogBox dismiss here: capture Metro (EXPO_PUBLIC_CAPTURE=1) mutes the toast, and the old fixed
      // tap at (1012,2236) actually lands on the Reports nav tab — it navigated away from Home.
      mkdirSync(OUT, { recursive: true });
      // Only two shots (top + one scroll): the dashboard is ~1.3 viewports, so one moderate swipe reveals
      // Upcoming Tasks. Let the scroll settle before the grab so screencap never catches a mid-fling frame.
      const loadShots = [];
      for (let i = 0; i < 2; i++) {
        const p = join(TMP, `load_${i}.png`);
        grab(p);
        loadShots.push(p);
        if (i < 1) {
          adb('shell', 'input', 'swipe', '540', '1700', '540', '700', '450');
          await delay(1300);
        }
      }
      const loadOut = join(OUT, '00-se-home-loading.png');
      process.stdout.write(
        execFileSync('python', [STITCH, loadOut, '180', '1970', ...loadShots], { encoding: 'utf-8' }),
      );
      console.log('  stitched 00-se-home-loading.png');
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

  // One full-page: progress card → quick-action tiles → Active Issues → Upcoming Tasks.
  console.log('· full-page site-engineer home');
  await stitchFull('01-se-home-dashboard');
  console.log('done.');
}

main().catch((err) => {
  console.error(String(err.message ?? err));
  process.exit(1);
});
