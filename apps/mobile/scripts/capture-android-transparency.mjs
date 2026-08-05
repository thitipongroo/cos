// Android Transparency Portal screenshot capture — adb/uiautomator only, like every sibling script.
//
// Writes to docs/screens/android/02-shared/privacy-policy/ — the post-auth policy screen at the top
// level and the eight portal screens under 01-data-collection/, mirroring the mockup tree
// (05_privacy_policy/00_policy_data + 05_privacy_policy/01_data_collection). They live under
// 02-shared because the policy and portal are reachable by EVERY role, not by one role's tab set. The entry
// point is the Data Collection card on the post-auth Privacy Policy (PO decision 2026-08-04), which
// is itself reached from the drawer's PRIVACY POLICY item — not from Profile, as it was at first.
//
// Signed in as a PROJECT_MANAGER (Thanawat Boonmee, seed-realistic.ts), because the identity screen
// shows that account's real stored values.
//
// Shell colour no longer depends on the role: dark is the product default for every role (PO
// decision 2026-08-04, themeStore.ts) with light selectable in Profile. These frames therefore
// capture the DARK default. An earlier version of this comment picked PROJECT_MANAGER specifically
// to get a light shell — that reason no longer holds.
//
// Prerequisites (all must already be running):
//   - emulator booted, debug app installed
//   - docker: postgres, pgbouncer, redis, keycloak, kafka, schema-registry
//   - migrations + prisma/seed.ts + prisma/seed-realistic.ts applied
//   - backend on :3000 with E2E_AUTH_BYPASS=true (fixes the OTP to OTP_CODE below)
//   - Metro: EXPO_PUBLIC_CAPTURE=1 EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1 npx expo start
// Run: node scripts/capture-android-transparency.mjs

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_POLICY = resolve(HERE, '../../../docs/screens/android/02-shared/privacy-policy');
const OUT = join(OUT_POLICY, '01-data-collection');
const TMP = process.env['TEMP'] ?? process.env['TMP'] ?? HERE;
const STITCH = join(HERE, 'stitch-fullpage.py');
const PKG = 'com.constructionos.cos';

// Thanawat Boonmee — PROJECT_MANAGER at Ekachai (seed-realistic.ts). National format: the login
// screen prefixes +66 from the country picker, so +66811000003 is typed as 0811000003.
const OTP_PHONE = process.env['E2E_OTP_PHONE'] ?? '0811000003';
const OTP_CODE = process.env['E2E_TEST_OTP'] ?? '123456';

// Fixed bands of the signed-in (app) shell, measured off a real frame on the Medium_Phone AVD
// (1080×2400) rather than guessed:
//   rows 0..310     status bar + TopBar (surface ends at row 219) + breadcrumb strip, whose baseline
//                   is the lowest fixed ink at row 310 — so scrolling content starts at 311.
//   rows 2210..     MobileNav + the gesture pill, measured by walking UP from the last row while it
//                   is still dominated by the nav surface. Do NOT measure this by scanning DOWN for
//                   the surface colour: the content cards are #0F172A too, so the first match lands
//                   in the middle of the page (2030 on this frame) and truncates every screenshot.
//
// TOP was 375 until 2026-08-04, when the full-width green SyncStatusBar (rows 311–374) was replaced
// by the top-bar sync pill. Re-measured rather than adjusted by arithmetic — the taller brand mark
// landed in the same change, so the old number could not simply be decremented.
//
// An earlier version tried to detect these at runtime by looking for "flat" rows; it returned
// TOP=5/BOT=2385, which made the stitcher compare mostly-static chrome and report scroll≈0 for every
// frame, producing a single-viewport "full page". Measured constants are correct and predictable.
const TOP = 311;
const BOT = 2210;

const SDK = process.env['ANDROID_HOME'] ?? process.env['ANDROID_SDK_ROOT'] ?? '';
const ADB = SDK
  ? join(SDK, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
  : 'adb';

const adb = (...args) => execFileSync(ADB, args, { maxBuffer: 16 * 1024 * 1024 }).toString();
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function dump() {
  for (let i = 0; i < 12; i++) {
    adb('shell', 'rm', '-f', '/sdcard/ui.xml');
    // uiautomator EXITS NON-ZERO on "ERROR: could not get idle state", which execFileSync turns into
    // a throw — so this must be caught, or the retry below never runs. That is not a hypothetical:
    // React Native keeps a view animating whenever a screen is loading (the app-launch spinner, the
    // ActivityIndicator on the network/device screens), and uiautomator refuses to dump until the
    // UI has been idle. Before this try/catch the first such moment aborted the whole run, which is
    // exactly what happened twice on 2026-08-05 — once mid-run, once immediately after login.
    try {
      if (adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml').includes('dumped to')) {
        return adb('shell', 'cat', '/sdcard/ui.xml').split('<');
      }
    } catch {
      // Not idle yet. Fall through to the delay and try again.
    }
    await delay(1000);
  }
  throw new Error('capture: uiautomator never produced a dump (UI never became idle)');
}

function centreOf(node) {
  const m = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node);
  if (!m) throw new Error('capture: node has no bounds');
  return { x: Math.round((+m[1] + +m[3]) / 2), y: Math.round((+m[2] + +m[4]) / 2) };
}

async function find(pred, what, tries = 25) {
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
  await delay(1200);
}

async function type(text) {
  adb('shell', 'input', 'text', text);
  await delay(600);
}

async function hideKeyboard() {
  if (!adb('shell', 'dumpsys', 'input_method').includes('mInputShown=true')) return;
  adb('shell', 'input', 'keyevent', '111'); // ESC — never BACK, which can quit from the root route
  await delay(1000);
}

/** RN's LogBox toast — debug-only, keep it out of the docs. */
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

function grab(path) {
  const png = execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
  if (png.length < 20_000) throw new Error(`capture: ${path} screenshot looks empty`);
  writeFileSync(path, png);
}

/** Scroll the current screen back to the top so off-viewport rows become findable again. */
async function rewindToTop() {
  for (let i = 0; i < 8; i++) {
    adb('shell', 'input', 'swipe', '540', '700', '540', '1900', '300');
    await delay(400);
  }
  await delay(600);
}

/** Rewind, shoot descending viewports, stitch ONE full-page PNG (docs/screens/android/README.md). */
async function stitchFull(name, dir = OUT) {
  const dest = join(dir, `${name}.png`);
  mkdirSync(dirname(dest), { recursive: true });
  for (let i = 0; i < 8; i++) {
    adb('shell', 'input', 'swipe', '540', '700', '540', '1900', '300');
    await delay(400);
  }
  await delay(900);
  // 800px steps: the wide 1200px step used on the first Privacy Policy run dropped a whole bullet at
  // a seam on body-text-heavy content. Extra frames past the bottom are detected as zero-scroll.
  const SHOTS = 12;
  const shots = [];
  for (let i = 0; i < SHOTS; i++) {
    const p = join(TMP, `tp_${name.replace(/[^a-z0-9]/gi, '_')}_${i}.png`);
    grab(p);
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
  console.log(`  stitched ${name}.png`);
}

/**
 * Tap a row that may be BELOW the fold.
 *
 * `find()` only ever sees what is on screen: React Native does not report off-viewport rows to
 * uiautomator, so the hub's lower cards ("How it reaches us") are invisible to a plain find() after
 * a rewind. Scroll down a step at a time until the row appears, then tap it — and only once it sits
 * inside the content band, so the tap can never land on the bottom nav sitting over it.
 */
async function tapScrolling(id, what) {
  // Always start from the top: the search only walks DOWNWARD, so a row above the current scroll
  // position would never be found. Returning from a category screen leaves the hub wherever the
  // stitch left it, which is how the camera row went missing on a mid-list restart.
  await rewindToTop();
  for (let step = 0; step < 10; step++) {
    const node = (await dump()).find(
      (n) => n.includes(`resource-id="${id}"`) && n.includes('bounds='),
    );
    if (node) {
      const c = centreOf(node);
      if (c.y > TOP + 40 && c.y < BOT - 40) {
        adb('shell', 'input', 'tap', String(c.x), String(c.y));
        await delay(1200);
        return;
      }
    }
    adb('shell', 'input', 'swipe', '540', '1800', '540', '1100', '400');
    await delay(900);
  }
  throw new Error(`capture: ${what} never became tappable`);
}

/**
 * Every screen reachable in one tap from the hub, in the order the hub lists them.
 *
 * The first seven are the category screens. The rest are the D-series (ADR-078/080/081/084), added
 * when those screens landed.
 *
 * TWO OF THE D-SERIES SCREENS ARE NOT HERE, deliberately:
 *   - `network-reattest` is reached from the network screen, not the hub, and RUNS an attestation as
 *     a side effect. A capture pass would re-attest this device on every run.
 *   - the export flow's later stages (`VERIFY`, `SUBMITTED`) need a real step-up code and would
 *     enqueue a genuine PDPA §30 request against the seeded account. The first stage is captured;
 *     the other two are left to the E2E suite, which can drive them with a fixed OTP.
 *
 * `data-export` also depends on `s1.identity.data-export`, which ships OFF. The capture run must set
 * it ON in Unleash, or the screen will photograph its "not available yet" state — a real state worth
 * having, but not the one this file is named for.
 */
const CATEGORIES = [
  { card: 'transparency-cat-identity', screen: 'transparency-identity', file: '01-identity' },
  { card: 'transparency-cat-location', screen: 'transparency-location', file: '02-location' },
  { card: 'transparency-cat-logs', screen: 'transparency-logs', file: '03-technical-logs' },
  { card: 'transparency-cat-manual', screen: 'transparency-manual', file: '04-manual-input' },
  { card: 'transparency-input-iot', screen: 'transparency-iot', file: '05-equipment-sensors' },
  { card: 'transparency-input-camera', screen: 'transparency-ai', file: '06-automated-processing' },
  { card: 'transparency-cat-delete', screen: 'transparency-delete', file: '07-erasure' },
  { card: 'transparency-export', screen: 'data-export', file: '08-data-export' },
  { card: 'transparency-tech-network', screen: 'transparency-network', file: '09-network-origin' },
  { card: 'transparency-tech-device', screen: 'device-details', file: '10-device-details' },
  { card: 'transparency-tech-security', screen: 'account-security', file: '11-account-security' },
  { card: 'transparency-tech-session', screen: 'transparency-session', file: '12-session' },
  {
    card: 'transparency-tech-timestamps',
    screen: 'transparency-timestamps',
    file: '13-timestamps',
  },
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  for (const p of ['tcp:8081', 'tcp:3000', 'tcp:8090']) adb('reverse', p, p);

  adb('shell', 'am', 'force-stop', PKG);
  adb('shell', 'pm', 'clear', PKG);
  adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
  console.log('· app launched, waiting for the JS bundle');
  await delay(30_000);
  await dismissDevBanners();

  console.log(`· Path A login as ${OTP_PHONE}`);
  await tap(byId('phone-input'), 'phone input');
  await type(OTP_PHONE);
  await hideKeyboard();
  await tap(byId('request-otp-button'), 'request OTP button');
  await find(byId('otp-input'), 'OTP input');
  await tap(byId('otp-input'), 'OTP input');
  await type(OTP_CODE);
  await hideKeyboard();
  await tap(byId('verify-otp-button'), 'verify OTP button');

  console.log('· waiting for the app shell');
  await find(byId('drawer-menu-button'), 'signed-in top bar', 40);
  await dismissDevBanners();

  // Drawer → PRIVACY POLICY → Data Collection card → portal (PO decision 2026-08-04). The old path
  // (Profile tab → Transparency Portal row) no longer exists: the Profile TAB was removed for every
  // role, and the portal row was removed from Profile when the policy card became the entry point.
  console.log('· drawer → Privacy Policy');
  await tap(byId('drawer-menu-button'), 'drawer trigger');
  await tap(byId('drawer-link-/privacy-policy'), 'PRIVACY POLICY drawer item');
  await find(byId('privacy-policy'), 'post-auth privacy policy');
  await dismissDevBanners();
  await delay(800);

  // The post-auth policy is a screen in its own right — same document as the pre-auth route, but in
  // the (app) shell with the breadcrumb and the "<" back control.
  await stitchFull('00-privacy-policy-postauth', OUT_POLICY);
  await rewindToTop();

  console.log('· Data Collection card → Transparency Portal');
  await tap(byId('privacy-section-collection'), 'Data Collection card');
  await find(byId('transparency'), 'portal hub');
  await dismissDevBanners();
  await delay(800);

  await stitchFull('00-portal');
  await rewindToTop();

  for (const c of CATEGORIES) {
    console.log(`· ${c.file}`);
    await tapScrolling(c.card, c.card);
    // Assert the destination before photographing it — a mis-tap otherwise saves the wrong screen.
    await find(byId(c.screen), c.screen);
    await dismissDevBanners();
    await delay(900);
    await stitchFull(c.file);
    adb('shell', 'input', 'keyevent', '4'); // BACK — safe in-app; returns to the hub
    await find(byId('transparency'), 'portal hub (after back)');
    // stitchFull leaves the hub scrolled to the BOTTOM. RN does not report off-viewport rows to
    // uiautomator, so the next card is invisible to find() until the list is rewound.
    await rewindToTop();
    await delay(600);
  }

  console.log(`\nDone → ${OUT}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
