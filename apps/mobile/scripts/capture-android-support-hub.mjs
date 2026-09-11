// Android Support Hub screenshot capture — adb/uiautomator only, same approach as every sibling
// capture-android-*.mjs (deliberately NOT Detox; see capture-android-login.mjs for why).
//
// Produces, under docs/screens/android/02-shared/02-support-centre/:
//   01-support-hub   the POST-AUTH Support screen — identity, active project, system status,
//                    search, eight Quick Help categories, Top FAQs, a featured article, device
//                    diagnostics, the role's own module list, and the pinned support footer
//
// Drawing: mockup/mobile/support_center/01_dashboard (Stitch, "ศูนย์ช่วยเหลือและสนับสนุน -
// Construction OS (Support Center)"), redrawn and named by the product owner 2026-09-11.
//
// ── WHY A NEW SCRIPT, AND WHY THIS FOLDER ───────────────────────────────────────────────────────
//
// The POST-AUTH Support screen had never been captured. `capture-android-get-help.mjs` shoots the
// PRE-AUTH one and says in its own header that it never signs in — that is the point of it, since
// all three screens it covers are reachable before authentication. This screen is reachable only
// AFTER, from the signed-in TopBar's "?", and nothing else in the repo taps `topbar-help`.
//
// It goes under `02-shared/` because that folder is defined as "cross-role screens that belong to
// no role", which this is: every role reaches it from the same "?" and it renders the same screen
// for all of them, differing only in the identity and module list it prints. It is NOT in
// `01-authen/` — it is not part of getting in — and not in a role folder, because it belongs to no
// single role.
//
// ── SIGNS IN AS THE SITE ENGINEER THE SPEC ALREADY USES ─────────────────────────────────────────
//
// `0811000009` / Waraporn Klinhom is the name `(app)/__tests__/support.spec.tsx` sets as its
// fixture, so the captured screen and the test name the same person. SITE_ENGINEER is in neither
// MFA_ROLES entry (`{TENANT_ADMIN, FINANCE}`), so the ordinary phone-OTP flow works.
//
// Prerequisites: docker compose up (including the `full` profile for Keycloak) + backend on :3000 +
// seeded demo data, emulator booted with the debug APK, and Metro started with EXPO_PUBLIC_CAPTURE=1.
// Run: node scripts/capture-android-support-hub.mjs

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../../docs/screens/android/02-shared/02-support-centre');
const TMP = process.env['TEMP'] ?? process.env['TMP'] ?? HERE;
const STITCH = join(HERE, 'stitch-fullpage.py');
const PKG = 'com.constructionos.cos';

// The seeded SITE_ENGINEER (backend/prisma/seed-realistic.ts).
const OTP_PHONE = process.env['E2E_OTP_PHONE'] ?? '0811000009';
const OTP_CODE = process.env['E2E_TEST_OTP'] ?? '123456';

// Fixed bands on the Medium_Phone AVD (1080×2400), the values every sibling script documents: rows
// 0..199 are the status bar + TopBar, and 2196 is the top of the bottom nav. This screen is inside
// `<Tabs>`, so the band stops at the nav rather than the viewport.
const TOP = 200;
const BOT = 2196;

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

async function find(pred, what, tries = 30) {
  for (let i = 0; i < tries; i++) {
    const node = (await dump()).find((n) => pred(n) && n.includes('bounds='));
    if (node) return centreOf(node);
    await delay(1000);
  }
  throw new Error(`capture: ${what} never appeared`);
}

/** True when a node is on screen right now — for the picker, which may already be answered. */
async function present(pred) {
  return (await dump()).some((n) => pred(n) && n.includes('bounds='));
}

const byId = (id) => (n) => n.includes(`resource-id="${id}"`);

async function tap(pred, what) {
  const c = await find(pred, what);
  adb('shell', 'input', 'tap', String(c.x), String(c.y));
  await delay(900);
}

/** Gboard's first-run onboarding covers the screen; every login script here guards against it. */
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

async function type(text) {
  adb('shell', 'input', 'text', text);
  await delay(600);
  await dismissImeOnboarding();
}

/** What a field currently holds, or null when it is not on screen. */
async function textOf(pred) {
  const node = (await dump()).find((n) => pred(n) && n.includes('bounds='));
  if (!node) return null;
  return /\stext="([^"]*)"/.exec(node)?.[1] ?? '';
}

/**
 * Tap a field, type into it, and CHECK THAT THE TEXT ARRIVED.
 *
 * On this emulator a field can be focused before the IME has finished binding to it, and a
 * keystroke sent into that window is dropped — the OTP screen sat with an empty field and a
 * disabled button the first time a sibling script ran. So this reads the value back.
 */
async function typeInto(pred, text, what) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await tap(pred, what);
    await type(text);
    await delay(400);
    const got = await textOf(pred);
    if (got !== null && got.includes(text)) return;
    console.log(`  · ${what}: typed "${text}", field reads "${got ?? 'gone'}" — retrying`);
    await delay(1200);
  }
  throw new Error(`capture: ${what} never accepted "${text}"`);
}

/** ESC, not BACK: BACK on a stale `mInputShown` reading falls through and quits the app. */
async function hideKeyboard() {
  if (!adb('shell', 'dumpsys', 'input_method').includes('mInputShown=true')) return;
  adb('shell', 'input', 'keyevent', '111');
  await delay(1200);
}

function grab(path) {
  const png = execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
  if (png.length < 20_000) throw new Error(`capture: ${path} screenshot looks empty`);
  writeFileSync(path, png);
}

/**
 * The band a pinned overlay occupies, read from its OWN node rather than guessed.
 *
 * This screen's footer is pinned over the scroll area. Without `--fab` the stitch draws it once per
 * viewport, each copy over the content behind it — which is exactly what the first capture of the
 * pre-auth twin did before the same fix landed there.
 */
async function bandOf(pred, what) {
  const node = (await dump()).find((n) => pred(n) && n.includes('bounds='));
  if (!node) return null;
  const m = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node);
  if (!m) throw new Error(`capture: ${what} has no bounds`);
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
}

/**
 * Rewind, shoot descending viewports, stitch ONE full-page PNG (docs/screens/android/README.md).
 *
 * A LONGER SETTLE THAN THE SIBLING SCRIPTS, and two bad runs of this one are why.
 *
 * The first run used the siblings' 600px step and 1500ms settle. The stitcher reported `sad` between
 * 1.1 and 3.0 — against 0.0 on the pre-auth twin — and two seams cut through content. MORE OVERLAP
 * WAS THE WRONG FIX: a 450px step over eleven shots pushed `sad` UP to 1.8–5.3 and simply moved the
 * seams onto different rows, because more shots means more seams rather than better ones.
 *
 * The cause was TWO things, and only the second was mine to guess at.
 *
 * THE FIRST WAS THE CAPTURE FLAG. `sad` read 1.8 on a shot pair taken at ZERO SCROLL — two pictures
 * of a stationary screen that disagreed, which can only be animation. Metro was running without
 * `EXPO_PUBLIC_CAPTURE=1`, so nothing was frozen. Restarted with it, that same measurement went to
 * 0.0 and three of the four content-cutting seams went with it. The flag must be set at Metro start;
 * `apps/mobile/.env` does not carry the key, so passing it on the command line is the only way.
 *
 * THE SECOND WAS NOT JOIN COUNT, THOUGH THAT WAS TRIED. "Every join is a chance for a seam, so take
 * fewer" sounds right and is wrong here. An 850px step over five shots — still inside the 900px
 * `--max-scroll` ceiling — pushed `sad` on the first join to 14.9 and produced a page 332px SHORTER
 * than the same screen at 600px: the correlator settled on an overlap that was too large and ate
 * real content. A stitch that loses a row is worse than one with a visible seam, because the seam
 * announces itself and the loss does not.
 *
 * So the step stays at 600px. What remains is a faint line at each join, through card borders and
 * the article image rather than through text. Two hypotheses have been tried and measured against
 * it — more overlap (worse: `sad` 1.8-5.3), fewer joins (much worse: content lost) — and both are
 * recorded here so the third person does not spend the runs again. The flag above is the fix that
 * actually moved the number.
 */
async function stitchFull(name, shots = 8, fab = null) {
  const dest = join(OUT, `${name}.png`);
  mkdirSync(dirname(dest), { recursive: true });
  for (let i = 0; i < 6; i++) {
    adb('shell', 'input', 'swipe', '540', '700', '540', '1800', '300');
    await delay(500);
  }
  await delay(900);
  const frames = [];
  for (let i = 0; i < shots; i++) {
    const p = join(TMP, `sh_${name.replace(/[^a-z0-9]/gi, '_')}_${i}.png`);
    grab(p);
    frames.push(p);
    if (i < shots - 1) {
      adb('shell', 'input', 'swipe', '540', '1700', '540', '1100', '500');
      await delay(2600);
    }
  }
  const extra = fab === null ? [] : ['--fab', fab.join(',')];
  process.stdout.write(
    execFileSync(
      'python',
      [STITCH, dest, String(TOP), String(BOT), ...extra, '--max-scroll', '900', ...frames],
      { encoding: 'utf-8' },
    ),
  );
  console.log(`  stitched ${name}.png`);
}

/**
 * A node whose bounds are a real rectangle.
 *
 * uiautomator happily reports an inverted box for a row that is half-scrolled — bottom above top —
 * and a centre computed from one lands somewhere else entirely.
 */
function hasRealBounds(node) {
  const m = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node);
  if (!m) return false;
  return Number(m[3]) > Number(m[1]) && Number(m[4]) > Number(m[2]);
}

const METRO_PORT = process.env['METRO_PORT'] ?? '8081';

async function main() {
  mkdirSync(OUT, { recursive: true });
  adb('reverse', 'tcp:8081', `tcp:${METRO_PORT}`);
  for (const p of ['tcp:3000', 'tcp:8090']) adb('reverse', p, p);

  adb('shell', 'am', 'force-stop', PKG);
  adb('shell', 'pm', 'clear', PKG);
  adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
  console.log('· app launched, waiting for the JS bundle');
  await delay(30_000);

  console.log(`· Path A login as ${OTP_PHONE}`);
  await typeInto(byId('phone-input'), OTP_PHONE, 'phone input');
  await hideKeyboard();
  await tap(byId('request-otp-button'), 'request OTP button');
  await find(byId('otp-input'), 'OTP input');
  await typeInto(byId('otp-input'), OTP_CODE, 'OTP input');
  await hideKeyboard();
  // The button is disabled until the field holds six digits, so a tap before `typeInto` confirmed
  // the text would be a tap on nothing.
  await tap(byId('verify-otp-button'), 'verify OTP button');

  // WAIT ON THE SHELL, NOT ON THE ROLE'S HOME. The first run of this script waited for
  // `home-screen` and timed out at 40s: nine home variants carry that id and `SiteEngineerHome.tsx`
  // — the one this user gets — is not among them. `topbar-help` is the right thing to wait for
  // anyway, because it is the control this script is walking towards and it exists on every (app)
  // screen for every role.
  //
  // The project picker may be raised first. The Support screen prints the ACTIVE PROJECT, so
  // answering it is what makes that line say something rather than "none selected".
  await find(byId('topbar-help'), 'signed-in shell', 40).catch(() => undefined);
  if (await present(byId('select-project-screen'))) {
    console.log('· choosing a project');
    const row = (await dump()).find(
      (n) =>
        n.includes('resource-id="select-project-') &&
        !n.includes('resource-id="select-project-progress-') &&
        !/resource-id="select-project-(backdrop|screen|close|search|filter|loading|failed|retry|empty|no-match|recommended)"/.test(
          n,
        ) &&
        hasRealBounds(n),
    );
    if (row) {
      const c = centreOf(row);
      adb('shell', 'input', 'tap', String(c.x), String(c.y));
      await delay(1500);
    }
  }

  await find(byId('topbar-help'), 'signed-in shell', 40);

  console.log('· Support Hub, from the TopBar "?"');
  // The ONLY post-auth entry (§32.7). The drawer's Support row was removed on 2026-08-17 precisely
  // so there is one way in from each side of login.
  await tap(byId('topbar-help'), 'TopBar help button');
  await find(byId('support'), 'Support Hub', 30);
  // One health probe settles behind the status card, and the diagnostics block reads the sync queue.
  await delay(4000);

  const footer = await bandOf(byId('support-live-chat'), 'live chat button');
  const fab = footer === null ? null : [0, footer[1] - 24, 1080, BOT];
  if (fab === null) console.log('  · no pinned footer on screen — stitching without --fab');
  await stitchFull('01-support-hub', 8, fab);

  console.log(`\nDone → ${OUT}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
