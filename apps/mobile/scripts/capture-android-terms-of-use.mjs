// Android Terms of Use screenshot capture — adb/uiautomator only, same approach as the sibling
// capture-android-*.mjs scripts (deliberately NOT Detox; see capture-android-login.mjs for why).
//
// Writes the two pre-auth Terms of Use screens to docs/screens/android/01-authen/04-terms-of-use/.
// They are PUBLIC: reached from the login footer and living in the (auth) route group, so they sit
// with the other 01-authen/ captures, in their own numbered subfolder:
//   01-terms-of-use           default state — clause 01 open, as the screen opens (the mockup's own
//                             initial state); the remaining five collapsed
//   02-terms-of-use-download  the download receipt (ADR-092) — the real PDF on the device, with its
//                             digest checked against the one the server published
//
// ONE file, matching the Privacy Policy's rule next door: the accordion is not walked and no page is
// committed per clause. Every clause title is visible in this frame, and the prose behind them is the
// i18n bundle, which is reviewable as text.
//
// THE FIRST FRAME NEEDS NO BACKEND; THE SECOND DOES. The document renders from the i18n bundle plus
// one bundled image, so Metro alone is enough for it — which was true of this whole script until
// ADR-092 made the download live. The receipt downloads the real PDF from `GET /terms/pdf` and
// verifies its digest on the device, so it needs NestJS on :3000 and `adb reverse tcp:3000` (both
// asserted below). Pass `--skip-download` to capture only the offline frame. (The login screen this
// launches into shows a red health dot when no backend is running; that screen is not captured here.)
//
// Prerequisites:
//   - emulator booted, debug app installed (android/app/build/outputs/apk/debug/app-debug.apk)
//   - Metro: EXPO_PUBLIC_CAPTURE=1 npx expo start
//     EXPO_PUBLIC_CAPTURE=1 matters — it mutes the dev LogBox toast and freezes animation loops, so a
//     capture is deterministic. Expo inlines EXPO_PUBLIC_* at Metro start, so it must be set THERE,
//     not here.
//   - adb reverse tcp:8081, and tcp:3000 for the download step (this script re-asserts both)
//   - the backend on :3000 for the download step only (`make docker-up` + `make dev-backend`)
// Run: node scripts/capture-android-terms-of-use.mjs [--skip-download]

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../../docs/screens/android/01-authen/04-terms-of-use');
const TMP = process.env['TEMP'] ?? process.env['TMP'] ?? HERE;
const STITCH = join(HERE, 'stitch-fullpage.py');
const PKG = 'com.constructionos.cos';

// Fixed bands on this screen, measured on the Medium_Phone AVD (1080×2400):
//   rows 0..199    status bar + the app's top bar; its bottom border is rows 197–199
//   rows 1972..    the pinned action bar (version + Download PDF + I AGREE) and, under it, Android's
//                  gesture pill. Both are drawn over the scrolling content and are identical in every
//                  shot, so the stitcher must treat the whole band as fixed — otherwise the action bar
//                  is repeated once per viewport down the full-page image.
// Everything between scrolls. The screen has no bottom nav of its own — it is a pre-auth route.
//
// BOT WAS MEASURED, NOT ESTIMATED. It first read 1990, and the 18 rows that put inside the scrolling
// region were the action bar's own top border — static content the stitcher then repeated at every
// seam, drawing a grey rule straight across clause 03 in the first capture. The value is the first
// row of the bar's 2px border, read off a screenshot at x=6 (outside every card, so the column shows
// the page background except where a full-width fixed bar paints over it).
const TOP = 200;
const BOT = 1972;
/**
 * The receipt screen has no pinned action bar — only the top bar above and Android's gesture pill
 * below (system UI, drawn over the app and identical in every shot), which is where 2350 comes from.
 * It is the figure the Privacy Policy capture uses, for the same reason.
 */
const RECEIPT_BOT = 2350;

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

/**
 * Tap something, then prove the tap LANDED — retrying if it did not.
 *
 * Same race as the Privacy Policy capture: `app/_layout.tsx` mounts its children underneath the
 * launch loader, so uiautomator reports the footer link while the gate is still closed and the first
 * tap is swallowed. Retrying is cheaper and more honest than a flat sleep.
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
async function stitchFull(name, top = TOP, bot = BOT) {
  const dest = join(OUT, `${name}.png`);
  mkdirSync(dirname(dest), { recursive: true });
  for (let i = 0; i < 8; i++) {
    adb('shell', 'input', 'swipe', '540', '700', '540', '1900', '300');
    await delay(500);
  }
  await delay(900);
  // Short scroll steps against a ~1790px content window, for the reason the Privacy Policy script
  // documents: a long step leaves the stitcher too little overlap to match on, and this page also
  // carries six similar-looking bars.
  const SHOTS = 12;
  const shots = [];
  for (let i = 0; i < SHOTS; i++) {
    const p = join(TMP, `tou_${name.replace(/[^a-z0-9]/gi, '_')}_${i}.png`);
    grab(p);
    shots.push(p);
    if (i < SHOTS - 1) {
      adb('shell', 'input', 'swipe', '540', '1700', '540', '1000', '500');
      await delay(1200);
    }
  }
  process.stdout.write(
    execFileSync('python', [STITCH, dest, String(top), String(bot), ...shots], {
      encoding: 'utf-8',
    }),
  );
  console.log(`  stitched ${name}.png`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  // 8081 Metro; 3000 the backend, needed only by the download step at the end.
  adb('reverse', 'tcp:8081', 'tcp:8081');
  adb('reverse', 'tcp:3000', 'tcp:3000');

  // Fresh start: pm clear drops any stored session so the app always lands on the login screen, which
  // is where the Terms of Use link lives.
  adb('shell', 'pm', 'clear', PKG);
  adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
  await assertOn('terms-of-use-link', 'login screen');

  await tapUntil('terms-of-use-link', 'terms-of-use', 'Terms of Use footer link');
  await delay(600);
  await stitchFull('01-terms-of-use');

  if (process.argv.includes('--skip-download')) {
    console.log(`\nDone (download skipped) → ${OUT}`);
    return;
  }

  // The receipt (ADR-092). DOWNLOAD PDF sits in the pinned action bar, so there is nothing to scroll
  // to first: stitchFull left the page at the bottom, and the bar is fixed over it either way.
  console.log('02-terms-of-use-download');
  try {
    // The transfer + digest check runs before the route changes, so this tap has to survive a second
    // or two of work; tapUntil already retries. The message names the likely cause, not the symptom.
    await tapUntil('terms-download-pdf', 'terms-of-use-downloaded', 'DOWNLOAD PDF button');
  } catch {
    throw new Error(
      'capture: the download never opened its receipt. This step needs the backend on :3000 — ' +
        'check `curl http://localhost:3000/api/v1/terms/metadata`, or pass --skip-download.',
    );
  }
  await delay(600);
  // Its own fixed bands: a top bar and NO pinned action bar, so the scrolling region runs to the
  // gesture pill. Reusing the document's BOT would treat 400 rows of this page as chrome.
  await stitchFull('02-terms-of-use-download', TOP, RECEIPT_BOT);

  console.log(`\nDone → ${OUT}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
