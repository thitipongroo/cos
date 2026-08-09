// Android PROJECT_MANAGER screenshot capture — adb/uiautomator only, like every sibling script.
//
// Writes the three screens built from mockup/mobile/06_project_manager on 2026-08-10, into that
// role's folders under docs/screens/android/PROJECT-MANAGER/:
//   01-Home/01-dashboard   the manager dashboard — committed spend, projects, issues, approvals,
//                          then the project picker and the Insights panel
//   03-Approvals/01-approvals  the PO/RFQ decision queue
//   04-Vendors/01-vendors      the supplier directory with trust scores
//
// Numbered for the role's own bottom bar — Home | Projects | Approvals | Vendors — so `02-Projects`
// is simply a folder this script does not write (that screen predates this work and is unchanged).
//
// LOGS IN AS THE SEEDED PROJECT MANAGER (`+66811000003`, Thanawat Boonmee — seed-realistic.ts), not
// as the procurement manager: PROJECT_MANAGER is the role whose bar these screens were added to
// first, and it is the one that shows the RFQ items as read-only, which is the harder case to get
// right. Set E2E_OTP_PHONE=0811000006 to capture the same screens as PROC_MANAGER instead — the same
// two tabs, with the RFQ award and vendor-manage controls enabled.
//
// THE INSIGHTS PANEL IS CAPTURED IN ITS IDLE STATE, deliberately. It generates a report only when the
// button is pressed, and that call goes to the ai-gateway (services/ai-gateway), which is not part of
// the local docker compose used for these captures. Pressing it with the gateway down would
// photograph an error, and no report is invented to avoid that — the idle state is what the screen
// honestly shows before anyone asks for one.
//
// Prerequisites: docker compose up + backend on :3000, emulator booted with the debug APK, and Metro
// started with EXPO_PUBLIC_CAPTURE=1 (mutes the dev LogBox toast, freezes animation loops).
// Run: node scripts/capture-android-project-manager.mjs

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../../docs/screens/android/PROJECT-MANAGER');
const TMP = process.env['TEMP'] ?? process.env['TMP'] ?? HERE;
const STITCH = join(HERE, 'stitch-fullpage.py');
const PKG = 'com.constructionos.cos';

const OTP_PHONE = process.env['E2E_OTP_PHONE'] ?? '0811000003';
const OTP_CODE = process.env['E2E_TEST_OTP'] ?? '123456';

// Fixed bands on the Medium_Phone AVD (1080×2400), the values the sibling scripts document: rows
// 0..199 are the status bar + TopBar, and 2196 is the top of the bottom nav. These screens pin
// nothing else — no FAB on a manager Home — so everything between the two scrolls.
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

const byId = (id) => (n) => n.includes(`resource-id="${id}"`);

async function tap(pred, what) {
  const c = await find(pred, what);
  adb('shell', 'input', 'tap', String(c.x), String(c.y));
  await delay(900);
}

/** Gboard's first-run onboarding covers the screen; the login scripts all guard against it. */
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

/** Rewind, shoot descending viewports, stitch ONE full-page PNG (docs/screens/android/README.md). */
async function stitchFull(name) {
  const dest = join(OUT, `${name}.png`);
  mkdirSync(dirname(dest), { recursive: true });
  for (let i = 0; i < 6; i++) {
    adb('shell', 'input', 'swipe', '540', '700', '540', '1800', '300');
    await delay(500);
  }
  await delay(900);
  const shots = [];
  for (let i = 0; i < 8; i++) {
    const p = join(TMP, `pm_${name.replace(/[^a-z0-9]/gi, '_')}_${i}.png`);
    grab(p);
    shots.push(p);
    if (i < 7) {
      adb('shell', 'input', 'swipe', '540', '1700', '540', '900', '500');
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
  for (const p of ['tcp:8081', 'tcp:3000', 'tcp:8090']) adb('reverse', p, p);

  adb('shell', 'am', 'force-stop', PKG);
  adb('shell', 'pm', 'clear', PKG);
  adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
  console.log('· app launched, waiting for the JS bundle');
  await delay(30_000);

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

  // Assert the destination rather than sleeping: a mis-tap then fails the run instead of being
  // photographed as if it were the dashboard.
  await find(byId('home-screen'), 'manager Home', 40);
  await delay(3000); // let the KPI fetches settle so the tiles are not photographed mid-dash
  await stitchFull('01-Home/01-dashboard');

  console.log('· Approvals tab');
  await tap(byId('approvals-tab'), 'Approvals tab');
  await find(byId('approvals-screen'), 'approvals-screen', 20);
  await delay(2500);
  await stitchFull('03-Approvals/01-approvals');

  console.log('· Vendors tab');
  await tap(byId('vendors-tab'), 'Vendors tab');
  await find(byId('vendors-screen'), 'vendors-screen', 20);
  // The per-vendor scorecards arrive after the list; wait for them so the cards are not captured
  // with their score slot still empty.
  await delay(4000);
  await stitchFull('04-Vendors/01-vendors');

  console.log(`\nDone → ${OUT}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
