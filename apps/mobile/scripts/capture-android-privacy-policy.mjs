// Android Privacy Policy screenshot capture — adb/uiautomator only, same approach as the sibling
// capture-android-*.mjs scripts (deliberately NOT Detox; see capture-android-login.mjs for why).
//
// RESTORED 2026-08-17 (product-owner decision), together with the folder it writes. This script and
// docs/screens/android/01-authen/03-privacy-policy/ were retired earlier the same day in 54ec44d3
// ("retire the pre-auth policy, terms, support and portal captures"); the decision to bring them back
// came after the policy's five sections were split into their own routes, which is the change these
// frames document. docs/screens/android/README.md is updated to match — its note that "nothing
// recreates the folders" was true only while this file did not exist.
//
// Writes six full-page frames:
//   00-privacy-policy-preauth   the policy itself — five section rows, as the screen opens
//   01-data-collection          what is collected today, and what is only planned
//   02-data-usage               what the data is used for
//   03-pdpa-gdpr                principles, regional compliance, residency, certification status
//   04-technical-security       encryption, network guard, tenant isolation, infrastructure
//   05-user-rights              the four PDPA/GDPR rights + the Authenticate action
//
// The five section frames are NOT the ones removed on 2026-08-07. Those were the same document with
// one accordion body expanded — duplicates of the post-auth capture, which is why they went. These
// are five distinct routes with content that exists nowhere else in the set.
//
// NO BACKEND REQUIRED. None of these screens makes an API call — they render from the i18n bundle and
// the app icon only — so Keycloak/NestJS/Postgres need not be running and no login is performed.
// Metro alone is enough. (The login screen it launches from shows a red health dot without a backend;
// that screen is not captured here.)
//
// Prerequisites:
//   - emulator booted, debug app installed (android/app/build/outputs/apk/debug/app-debug.apk)
//   - Metro: EXPO_PUBLIC_CAPTURE=1 npx expo start
//     EXPO_PUBLIC_CAPTURE=1 matters — it mutes the dev LogBox toast and freezes animation loops, so a
//     capture is deterministic. Expo inlines EXPO_PUBLIC_* at Metro start, so it must be set THERE,
//     not here. `dismissDevBanners()` below is a fallback for a Metro already running without it.
//   - adb reverse tcp:8081 (this script re-asserts it)
// Run: node scripts/capture-android-privacy-policy.mjs

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../../docs/screens/android/01-authen/03-privacy-policy');
const TMP = process.env['TEMP'] ?? process.env['TMP'] ?? HERE;
const STITCH = join(HERE, 'stitch-fullpage.py');
const PKG = 'com.constructionos.cos';

// Fixed bands on these screens, measured on the Medium_Phone AVD (1080×2400):
//   rows 0..199    status bar + the app's top bar; its bottom border is rows 197–199
//   rows 2350..    Android's gesture pill (system UI drawn over the app; identical in every shot)
// Everything between scrolls. None of these routes has a bottom nav — they are all pre-auth.
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

/** RN's LogBox toast — only present when Metro was started without EXPO_PUBLIC_CAPTURE=1. */
async function dismissDevBanners() {
  for (let i = 0; i < 4; i++) {
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

/**
 * Tap something, then prove the tap LANDED — retrying if it did not.
 *
 * A node being in the view tree does not mean the app will accept a touch on it:
 * `app/_layout.tsx` wraps everything in a `<LoadingBoundary>` that mounts its children UNDERNEATH
 * the launch loader (that is what makes the crossfade possible), so uiautomator reports
 * `privacy-policy-link` while the gate is still closed. The first tap is swallowed and the run then
 * dies waiting for a destination that was never opened — on a screen that works when tapped by hand
 * a second later.
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
async function stitchFull(name) {
  const dest = join(OUT, `${name}.png`);
  mkdirSync(dirname(dest), { recursive: true });
  for (let i = 0; i < 8; i++) {
    adb('shell', 'input', 'swipe', '540', '700', '540', '1900', '300');
    await delay(500);
  }
  await delay(900);
  // Short scroll steps (800px against a 2150px content window) on purpose. A 1200px step left the
  // stitcher only ~950px of overlap to match on, and against walls of similar-looking body text —
  // which every one of these section screens is — it mis-matched and dropped a whole bullet at a
  // seam. SHOTS is generous; once the bottom is reached the extra frames are detected as zero-scroll
  // and skipped.
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

/**
 * The five section routes, in the order the policy lists them.
 *
 * `row` is the testID of the row on the policy screen (the section ids in
 * components/PrivacyPolicyDocument.tsx), `screen` the testID of the route it pushes, and `file` the
 * committed frame name — the three differ because the ids are the policy's own vocabulary while the
 * routes are named for what the mockup calls the screens.
 */
const SECTIONS = [
  { row: 'collection', screen: 'privacy-data-collection', file: '01-data-collection' },
  { row: 'usage', screen: 'privacy-data-usage', file: '02-data-usage' },
  { row: 'compliance', screen: 'privacy-pdpa-gdpr', file: '03-pdpa-gdpr' },
  { row: 'security', screen: 'privacy-technical-security', file: '04-technical-security' },
  { row: 'rights', screen: 'privacy-user-rights', file: '05-user-rights' },
];

/**
 * The DPO contact form (ADR-091), reached from the policy footer rather than from a section row.
 *
 * The RECEIPT is not captured here and cannot be: reaching it means POSTing a real inquiry, which
 * needs the backend up AND `s1.identity.privacy-inquiry` flipped on — the flag ships OFF (QM-15).
 * Every other frame in this folder renders from the i18n bundle alone, which is what lets this script
 * run against Metro with nothing else started; adding one backend-dependent step would make the whole
 * run conditional on a stack that the other six frames do not need.
 */
const CONTACT = { link: 'privacy-contact-link', screen: 'privacy-contact', file: '06-contact' };

/**
 * The download receipt (ADR-091). THE ONE FRAME HERE THAT NEEDS THE BACKEND.
 *
 * Everything above renders from the i18n bundle alone, which is what lets this script run against
 * Metro with nothing else started. This step downloads the real PDF from
 * `GET /privacy/policy/pdf` and verifies its digest on the device, so it needs NestJS on :3000 and
 * `adb reverse tcp:3000` (asserted below). Run with `--skip-download` to capture only the six
 * offline frames.
 */
const DOWNLOAD = {
  button: 'privacy-download-pdf',
  screen: 'privacy-policy-downloaded',
  file: '07-download-complete',
};

async function main() {
  mkdirSync(OUT, { recursive: true });
  // 8081 Metro; 3000 the backend, needed only by the download step at the end.
  adb('reverse', 'tcp:8081', 'tcp:8081');
  adb('reverse', 'tcp:3000', 'tcp:3000');

  // Fresh start: pm clear drops any stored session so the app always lands on the login screen, which
  // is where the Privacy Policy link lives.
  adb('shell', 'pm', 'clear', PKG);
  adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
  await find(byId('privacy-policy-link'), 'login screen', 90);
  await dismissDevBanners();

  await tapUntil('privacy-policy-link', 'privacy-policy', 'Privacy Policy footer link');
  await delay(600);
  await dismissDevBanners();
  await stitchFull('00-privacy-policy-preauth');

  for (const section of SECTIONS) {
    console.log(section.file);
    // stitchFull leaves the policy scrolled to the BOTTOM, so rewind before looking for the row.
    for (let i = 0; i < 8; i++) {
      adb('shell', 'input', 'swipe', '540', '700', '540', '1900', '300');
      await delay(400);
    }
    await delay(700);
    await tapUntil(`privacy-section-${section.row}`, section.screen, `${section.row} row`);
    await delay(500);
    await stitchFull(section.file);
    // Back to the policy. The route's own back control, not the hardware key: on the last section the
    // hardware key would pop the whole (auth) stack if the tap were ever swallowed.
    await tapUntil(`${section.screen}-back`, 'privacy-policy', `${section.file} back`);
    await delay(500);
  }

  console.log(CONTACT.file);
  for (let i = 0; i < 8; i++) {
    adb('shell', 'input', 'swipe', '540', '700', '540', '1900', '300');
    await delay(400);
  }
  await delay(700);
  // The link sits in the FOOTER, below the five rows, so it needs a scroll down rather than the
  // rewind the sections needed.
  for (let i = 0; i < 3; i++) {
    adb('shell', 'input', 'swipe', '540', '1800', '540', '900', '400');
    await delay(500);
  }
  await delay(700);
  await tapUntil(CONTACT.link, CONTACT.screen, 'DPO contact link');
  await delay(500);
  await stitchFull(CONTACT.file);

  if (process.argv.includes('--skip-download')) {
    console.log(`\nDone (download skipped) → ${OUT}`);
    return;
  }

  console.log(DOWNLOAD.file);
  await tapUntil(`${CONTACT.screen}-back`, 'privacy-policy', 'contact back');
  await delay(500);
  for (let i = 0; i < 8; i++) {
    adb('shell', 'input', 'swipe', '540', '700', '540', '1900', '300');
    await delay(400);
  }
  await delay(700);
  for (let i = 0; i < 3; i++) {
    adb('shell', 'input', 'swipe', '540', '1800', '540', '900', '400');
    await delay(500);
  }
  await delay(700);
  // The download runs before the route changes, so this tap has to survive a second or two of work.
  // tapUntil already retries; the failure message names the likely cause rather than the symptom.
  try {
    await tapUntil(DOWNLOAD.button, DOWNLOAD.screen, 'download PDF button');
  } catch {
    throw new Error(
      'capture: the download never opened its receipt. This step needs the backend on :3000 — ' +
        'check `curl http://localhost:3000/api/v1/privacy/policy/metadata`, or pass --skip-download.',
    );
  }
  await delay(600);
  await stitchFull(DOWNLOAD.file);

  console.log(`\nDone → ${OUT}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
