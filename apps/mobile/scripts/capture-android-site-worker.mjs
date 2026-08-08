// Android SITE_WORKER screenshot capture — adb/uiautomator only, like every sibling script.
//
// Writes the role's screens to docs/screens/android/SITE-WORKER/, one folder per bottom-nav tab:
// 01-Home, 02-Issues, 03-Reports, 04-Safety. They implement
// mockup/mobile/05_site_worker/{01_tasks,02_issues,03_reports,04_safety}.
//
// Tasks lives under 01-Home/ because that is where it is reached from: it was a tab until
// 2026-08-08, when Home took the slot (§32.7 allows exactly four), and it is now pushed from Home's
// Tasks quick action. The README's own rule is that a screen is filed under the tab it is reached
// from.
//
// Signed in as Somsak Duangdee (+66811000010, seed-realistic.ts) — the seeded SITE_WORKER. Role
// matters: Issues/Reports/Safety are this role's tabs (MobileNav), so any other account renders a
// different bar entirely.
//
// Shell is DARK — the product default for every role since 2026-08-04 (themeStore.ts).
//
// Prerequisites (all must already be running):
//   - emulator booted, debug app installed
//   - docker: postgres, pgbouncer, redis, keycloak, kafka, schema-registry
//   - migrations + prisma/seed.ts + prisma/seed-realistic.ts + prisma/provision-keycloak-demo.ts applied
//     (seed-realistic is what gives this worker its project memberships and the safety checklists —
//      without it every screen here renders an empty state)
//   - backend on :3000 with E2E_AUTH_BYPASS=true (fixes the OTP to OTP_CODE below)
//   - Metro: EXPO_PUBLIC_CAPTURE=1 EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1 npx expo start
// Run: node scripts/capture-android-site-worker.mjs

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../../docs/screens/android/SITE-WORKER');
const STITCH = join(HERE, 'stitch-fullpage.py');
const TMP = tmpdir();
const PKG = 'com.constructionos.cos';

const OTP_PHONE = process.env['E2E_OTP_PHONE'] ?? '0811000010';
const OTP_CODE = process.env['E2E_TEST_OTP'] ?? '123456';

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

async function find(pred, what, tries = 25) {
  for (let i = 0; i < tries; i++) {
    const node = (await dump()).find((n) => pred(n) && n.includes('bounds='));
    if (node) return centreOf(node);
    await delay(1000);
  }
  throw new Error(`capture: ${what} never appeared`);
}

const byId = (id) => (n) => n.includes(`resource-id="${id}"`);

/**
 * Pick the first project in <ProjectPicker />.
 *
 * The picker does NOT auto-select — every screen it appears on starts with no project chosen, which
 * is correct behaviour (choosing one for the worker would file a report against the wrong site) but
 * means the issue list, the checklist fetch and the report form all sit in their "nothing selected"
 * state until something taps a chip. Matched by testID PREFIX because the id is a seeded UUID.
 */
async function pickFirstProject() {
  const c = await find(
    (n) => /resource-id="project-option-[0-9a-f-]{36}"/.test(n),
    'a project chip',
  );
  adb('shell', 'input', 'tap', String(c.x), String(c.y));
  await delay(1500);
}

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

/** Single top viewport — for a screen that fits one screenful. */
function grabOne(name) {
  const dest = join(OUT, `${name}.png`);
  mkdirSync(dirname(dest), { recursive: true });
  grab(dest);
  console.log(`  saved ${name}.png`);
}

/**
 * Rewind to the top, then shoot descending viewports and stitch ONE full-page PNG via
 * scripts/stitch-fullpage.py. `bot` sits just above whatever is pinned to the bottom of that screen so
 * it is appended once rather than repeated down the page — 2196 is the bottom-nav top edge on the
 * Medium_Phone AVD, which is the only fixed element on these screens (no FAB on this role's tabs).
 */
async function stitchFull(name, top, bot) {
  const dest = join(OUT, `${name}.png`);
  mkdirSync(dirname(dest), { recursive: true });
  for (let i = 0; i < 5; i++) {
    adb('shell', 'input', 'swipe', '540', '700', '540', '1700', '300');
    await delay(500);
  }
  await delay(700);
  const shots = [];
  for (let i = 0; i < 6; i++) {
    const p = join(TMP, `sw_${name.replace(/[^a-z0-9]/gi, '_')}_${i}.png`);
    grab(p);
    shots.push(p);
    if (i < 5) {
      adb('shell', 'input', 'swipe', '540', '1700', '540', '650', '500');
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

// The bottom-nav top edge on this AVD. Everything on these four tabs scrolls under it.
const NAV_TOP = 2196;

async function main() {
  mkdirSync(OUT, { recursive: true });
  for (const p of ['tcp:8081', 'tcp:3000', 'tcp:8090']) adb('reverse', p, p);

  adb('shell', 'am', 'force-stop', PKG);
  adb('shell', 'pm', 'clear', PKG);
  // The Issues screen is camera-FIRST (the mockup opens on a viewfinder). `pm clear` wipes granted
  // permissions along with the data, so without this the screen renders its "enable camera" prompt
  // and the capture documents a permission dialog instead of the feature. Granting it here keeps the
  // run self-contained — the alternative is a hand-tapped system dialog that uiautomator has to race.
  adb('shell', 'pm', 'grant', PKG, 'android.permission.CAMERA');
  adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
  console.log('· app launched, waiting for the JS bundle');
  await delay(30_000);
  await dismissDevBanners();

  console.log(`· Path A login as ${OTP_PHONE} (SITE_WORKER)`);
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

  // Home — the role's landing tab since 2026-08-08: KPI cards, the project picker + check-in, and
  // the quick actions. Asserted on the check-in button rather than just the screen, because that
  // control is the reason Home is a tab at all for this role.
  console.log('· 01-Home/01-home');
  await tap(byId('home-tab'), 'home tab');
  await find(byId('home-screen'), 'home-screen');
  await find(byId('check-in-button'), 'check-in button');
  await dismissDevBanners();
  await delay(1200);
  grabOne('01-Home/01-home');

  // Tasks — pushed from Home's quick action, so it carries a breadcrumb (HOME › TASKS) and a back
  // chevron like every other child screen. Delta sync has to land first or the list is legitimately
  // empty, so at least one card is asserted BEFORE the shot: an empty Tasks screen is a valid app
  // state but a useless screenshot, and it must fail the run rather than be committed.
  console.log('· 01-Home/02-tasks');
  await tap(byId('qa-tasks'), 'Tasks quick action');
  await find(byId('tasks-screen'), 'tasks-screen');
  await find((n) => /resource-id="task-[0-9a-f-]{36}"/.test(n), 'at least one task card', 40);
  await dismissDevBanners();
  await delay(1200);
  grabOne('01-Home/02-tasks');

  // Issues — camera-first, so it is taller than a viewport (viewfinder + 4 category chips + voice +
  // description + submit + the synced list). Stitched.
  console.log('· 02-Issues/01-issue-capture');
  await tap(byId('issues-tab'), 'issues tab');
  await find(byId('issues-screen'), 'issues-screen');
  await pickFirstProject();
  await find(byId('issue-type-DEFECT'), 'issue category chips');
  await dismissDevBanners();
  await delay(1500);
  await stitchFull('02-Issues/01-issue-capture', 180, NAV_TOP);

  // Daily report — the longest screen in the set (manpower + shift + per-trade bars + summary +
  // blockers + photos + the two actions).
  console.log('· 03-Reports/01-daily-report');
  await tap(byId('report-tab'), 'report tab');
  await find(byId('report-screen'), 'report-screen');
  await pickFirstProject();
  await find(byId('manpower-total'), 'manpower stepper');
  await dismissDevBanners();
  await delay(1500);
  await stitchFull('03-Reports/01-daily-report', 180, NAV_TOP);

  // Safety checklist. Asserted on a real checklist ITEM, not just the screen: with no checklists
  // seeded the screen renders its honest empty state, and that must fail the run instead of being
  // committed as though it were the feature.
  console.log('· 04-Safety/01-safety-checklist');
  await tap(byId('safety-checklist-tab'), 'safety tab');
  await find(byId('safety-checklist-screen'), 'safety-checklist-screen');
  await pickFirstProject(); // nothing is fetched until a project is chosen (see the screen's comment)
  await find((n) => /resource-id="safety-item-/.test(n), 'at least one checklist item', 40);
  await dismissDevBanners();
  await delay(1500);
  await stitchFull('04-Safety/01-safety-checklist', 180, NAV_TOP);

  console.log(`\nDone → ${OUT}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
