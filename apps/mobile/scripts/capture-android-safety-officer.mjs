// Android SAFETY_OFFICER screenshot capture — adb/uiautomator only, like every sibling script.
//
// Writes the four screens of the role's bar into docs/screens/android/07-safety-officer/:
//   01-Home/01-sa-home-dashboard        open-incidents tile · the two unavailable KPI tiles ·
//                                        the daily-checklist card · recent incidents · report FAB
//   02-Incidents/01-sa-incident-dashboard  the four filter pills · the incident feed · AI-risk card
//   03-Checklists/01-sa-safety-checklist   the inspection list (the checklist itself is behind a row)
//   04-Permits/01-sa-permits               the permit register + the approve/reject controls
//
// Numbered for the bar as the product owner settled it on 2026-08-13 —
// Home | Incidents | Checklists | Permits. "Checklists" is the `/inspections` ROUTE relabelled, so
// its tab button testID is `inspection-tab`, not `checklists-tab`; see components/MobileNav.tsx.
//
// LOGS IN AS THE SEEDED SAFETY OFFICER — `+66811000007`, Decha Phumipat (backend/prisma/
// seed-realistic.ts). Path A (phone + OTP), like every other capture script here.
//
// THE PROJECT PICKER IS PART OF THE FLOW, not an obstacle to skip. The shell raises
// <SelectProjectSheet /> for this role until a site is chosen (app/(app)/_layout.tsx, 2026-08-13),
// because all three drawings open with the Active Project bar and that bar renders NOTHING with no
// project. The script answers it once, and every screen after that is scoped to that site.
//
// SEVERAL PANELS PHOTOGRAPH AS "NOT AVAILABLE YET", AND THAT IS THE HONEST STATE, not a broken
// capture. The mockups draw a compliance percentage, safe-hours-since-last-LTI, an AI-predicted risk
// and an AI hazard alert; none of them has a source in this platform, and the product owner's ruling
// (2026-08-13) is to draw the zone and say so rather than print an invented figure. What IS real in
// these frames — the open-incident count, the incident feed, the checklist template, the permit
// register — comes from the live backend against seeded data.
//
// Prerequisites: docker compose up + backend on :3000 + seeded demo data, emulator booted with the
// debug APK, and Metro started with EXPO_PUBLIC_CAPTURE=1 (mutes the dev LogBox toast, freezes
// animation loops).
// Run: node scripts/capture-android-safety-officer.mjs
//      node scripts/capture-android-safety-officer.mjs permits   ← re-shoot one screen only

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../../docs/screens/android/07-safety-officer');
const TMP = process.env['TEMP'] ?? process.env['TMP'] ?? HERE;
const STITCH = join(HERE, 'stitch-fullpage.py');
const PKG = 'com.constructionos.cos';

const OTP_PHONE = process.env['E2E_OTP_PHONE'] ?? '0811000007';
const OTP_CODE = process.env['E2E_TEST_OTP'] ?? '123456';

// Fixed bands on the Medium_Phone AVD (1080×2400), the values every sibling script documents: rows
// 0..199 are the status bar + TopBar, and 2196 is the top of the bottom nav.
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

/** A node's exact rectangle, for handing a floating overlay's bounds to the stitcher. */
async function boundsOf(pred, what) {
  const node = (await dump()).find((n) => pred(n) && n.includes('bounds='));
  if (!node) throw new Error(`capture: ${what} never appeared`);
  const m = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node);
  return [+m[1], +m[2], +m[3], +m[4]];
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
async function stitchFull(name, fab) {
  const dest = join(OUT, `${name}.png`);
  mkdirSync(dirname(dest), { recursive: true });
  for (let i = 0; i < 6; i++) {
    adb('shell', 'input', 'swipe', '540', '700', '540', '1800', '300');
    await delay(500);
  }
  await delay(900);
  const shots = [];
  for (let i = 0; i < 8; i++) {
    const p = join(TMP, `sa_${name.replace(/[^a-z0-9]/gi, '_')}_${i}.png`);
    grab(p);
    shots.push(p);
    if (i < 7) {
      adb('shell', 'input', 'swipe', '540', '1700', '540', '900', '500');
      await delay(1200);
    }
  }
  // Every screen here pins a FAB inside the scrolling band, so it lands in every shot. Its measured
  // bounds go to the stitcher, which erases it from the content and draws it once.
  const fabArgs = fab === undefined ? [] : ['--fab', fab.join(',')];
  process.stdout.write(
    execFileSync('python', [STITCH, dest, String(TOP), String(BOT), ...fabArgs, ...shots], {
      encoding: 'utf-8',
    }),
  );
  console.log(`  stitched ${name}.png`);
}

const ONLY = new Set(process.argv.slice(2));
const wanted = (key) => ONLY.size === 0 || ONLY.has(key);

/**
 * Which host port Metro is on.
 *
 * The device always asks for 8081 — that is baked into the dev-client build — so the reverse tunnel
 * maps device:8081 to whatever host port Metro actually took. It is a variable because a developer
 * machine often already has a Metro on 8081 from another session, and killing someone else's dev
 * server to take the port back is a worse trade than forwarding around it.
 */
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
  await tap(byId('phone-input'), 'phone input');
  await type(OTP_PHONE);
  await hideKeyboard();
  await tap(byId('request-otp-button'), 'request OTP button');
  await find(byId('otp-input'), 'OTP input');
  await tap(byId('otp-input'), 'OTP input');
  await type(OTP_CODE);
  await hideKeyboard();
  await tap(byId('verify-otp-button'), 'verify OTP button');

  // WHICH SITE, BEFORE ANYTHING ELSE. The picker is raised over Home for this role (2026-08-13) and
  // is the first thing after sign-in, so it is answered here — waiting for `home-screen` first
  // fails, because the overlay owns the screen until a site is chosen.
  await find(byId('select-project-screen'), 'project picker', 40);
  if (await present(byId('select-project-screen'))) {
    console.log('· choosing a site');
    // Each row is `select-project-{project_id}`; the first one on screen is taken. The progress bar
    // inside a row carries `select-project-progress-{id}`, so that prefix is excluded explicitly.
    const row = (await dump()).find(
      (n) =>
        n.includes('resource-id="select-project-') &&
        !n.includes('resource-id="select-project-progress-') &&
        !/resource-id="select-project-(backdrop|screen|close|search|filter|loading|failed|retry|empty|no-match|recommended)"/.test(
          n,
        ) &&
        n.includes('bounds='),
    );
    if (row) {
      const c = centreOf(row);
      adb('shell', 'input', 'tap', String(c.x), String(c.y));
      await delay(1500);
    }
  }

  // Now the destination, asserted rather than slept on — a mis-tap fails the run instead of being
  // photographed as if it were the dashboard.
  await find(byId('home-screen'), 'safety officer Home', 40);

  if (wanted('incidents')) {
    console.log('· Incidents tab');
    await tap(byId('incidents-tab'), 'Incidents tab');
    await find(byId('incidents-screen'), 'incidents-screen', 20);
    await delay(2500);
    await stitchFull(
      '02-Incidents/01-sa-incident-dashboard',
      await boundsOf(byId('incident-fab'), 'Incidents FAB'),
    );
  }

  if (wanted('checklists')) {
    // The tab is LABELLED "Checklists" and the ROUTE is `inspections` — hence `inspection-tab`,
    // which MobileNav gives this route for the Detox suite and which survives the relabel.
    console.log('· Checklists tab');
    await tap(byId('inspection-tab'), 'Checklists tab');
    await find(byId('inspection-list'), 'inspection-list', 20);
    await delay(2000);
    await stitchFull('03-Checklists/01-sa-safety-checklist');
  }

  // THE CHECKLIST ITSELF — which is what `03_checklists/01_sa_safety_checklist` actually draws. The
  // frame above is the list one step in front of it; this is the screen with the hazard-alert panel,
  // the PASS/FAIL rows, the attachment block and the signature pad.
  if (wanted('checklist-detail')) {
    console.log('· Checklists → fill');
    await tap(byId('inspection-tab'), 'Checklists tab');
    await find(byId('inspection-list'), 'inspection-list', 20);
    await tap(byId('new-inspection-button'), 'FILL CHECKLIST');
    await find(byId('inspection-checklist'), 'inspection-checklist', 20);
    await delay(1500);
    await stitchFull('03-Checklists/02-sa-checklist-fill');
  }

  if (wanted('permits')) {
    console.log('· Permits tab');
    await tap(byId('permits-tab'), 'Permits tab');
    await find(byId('permits-screen'), 'permits-screen', 20);
    await delay(2500);
    await stitchFull(
      '04-Permits/01-sa-permits',
      await boundsOf(byId('permit-fab'), 'Permits FAB'),
    );
  }

  // HOME IS SHOT LAST, for the reason the project-manager script documents: a dashboard
  // photographed seconds after sign-in can catch its own load losing a race with the session. This
  // screen refetches on focus, so returning to the tab at the end photographs settled data.
  if (wanted('home')) {
    console.log('· Home tab (last — see the note above)');
    await tap(byId('home-tab'), 'Home tab');
    await find(byId('home-screen'), 'safety officer Home', 20);
    // Three requests in flight (compliance · incidents · checklists) — wait for the slowest.
    await delay(4000);
    await stitchFull(
      '01-Home/01-sa-home-dashboard',
      await boundsOf(byId('home-report-incident-fab'), 'Home FAB'),
    );
  }

  console.log(`\nDone → ${OUT}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
