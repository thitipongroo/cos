// Android VIEWER screenshot capture — adb/uiautomator only, like every sibling script.
//
// Produces, under docs/screens/android/13-viewer/:
//   01-Home/01-viewer-dashboard      portfolio counts, budget, system insight, tracked projects
//   02-Projects/01-project-list      search, category chips, project cards
//   03-Map/01-project-map            the site map and its Active Sites sheet
//   04-Insights/01-project-insights  progress curve, safety, risk forecast, issue severity
//   05-Profile/01-account-settings   the shared screen plus this role's System Permissions block
//   06-Procurement/01-procurement    access banner, PO KPIs, delivery predictor, monitored lines
//   07-Budget/01-budget              total/committed/actual, absorption, BOQ divisions, verified log
//
// ── SIX SCREENS SINCE 2026-09-11, AND FOUR OF THE FIRST FIVE WERE REDRAWN ────────────────────────
//
// The product owner asked for the same set again and named six screens. The Stitch project held the
// five above plus two, so a COUNT comparison said "two new" — and sha256 against the repo copies
// said four of the five had been redrawn since 2026-09-10. Every frame here is therefore retaken,
// not just the two added ones.
//
// PROCUREMENT AND BUDGET ARE TABS, not drawer rows — the third and fourth slots of this role's
// enumerated bar (Home | Projects | Procurement | Budget). Until 2026-09-11 both rendered another
// role's screen to a viewer, approve button and "request an amendment" included; each route branches
// on role now (§20.7.9, ADR-103) and these two frames are the first photographs of the branch.
//
// ── THIS ROLE HAD NEVER BEEN CAPTURED, AND COULD NOT HAVE BEEN ──────────────────────────────────
//
// `docs/screens/android/` held twelve role folders and none for VIEWER. The reason was upstream of
// the capture path: `backend/prisma/seed-realistic.ts` had a demo user for eleven of the twelve
// roles and none for this one, so there was nobody to sign in as. The role's Home also rendered a
// 22-line placeholder until 2026-09-10, so nothing had gone looking.
//
// `mockup/mobile/role_viewer/` (five Stitch screens, requested by the product owner on 2026-09-10)
// closed both: the screens exist, and `viewer` / `+66811000013` / Somsak Watcharawit is seeded with
// a `projects.project_members` row — which is not a convenience for screenshots. Every screen this
// role owns is a view OF its projects, so a VIEWER belonging to nothing photographs five empty
// states on a fully seeded database. That is the same defect `sw1` was added to fix on 2026-08-08.
//
// PATH A. `MFA_ROLES` in `backend/prisma/provision-keycloak-demo.ts` is `{TENANT_ADMIN, FINANCE}`
// and this role is in neither, so the ordinary phone-OTP flow works.
//
// TWO SCREENS ARE REACHED FROM THE DRAWER, NOT FROM A TAB. `/map` and `/insights` are drawn on the
// mockups' bottom bar; that five-screen set draws FOUR different bars and VIEWER is one of the three
// roles §32.7's table enumerates, so the product owner kept the enumerated bar
// (Home | Projects | Procurement | Budget) and both screens became drawer rows.
//
// THE MAP IS NOT STITCHED. It is a fixed-height layout — a canvas with a sheet pinned under it,
// nothing scrolls at page level — so `stitchFull` would photograph the same viewport eight times
// and correlate noise. It is one frame, cropped to the same band as its siblings.
//
// Prerequisites: docker compose up (including the `full` profile for Keycloak) + backend on :3000 +
// seeded demo data, emulator booted with the debug APK, and Metro started with EXPO_PUBLIC_CAPTURE=1.
// Run: node scripts/capture-android-viewer.mjs

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../../docs/screens/android/13-viewer');
const TMP = process.env['TEMP'] ?? process.env['TMP'] ?? HERE;
const STITCH = join(HERE, 'stitch-fullpage.py');
const PKG = 'com.constructionos.cos';

// The seeded VIEWER (backend/prisma/seed-realistic.ts, key `viewer`).
const OTP_PHONE = process.env['E2E_OTP_PHONE'] ?? '0811000013';
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
 * THE FIRST RUN OF THIS SCRIPT SAT ON THE OTP SCREEN WITH AN EMPTY FIELD. The tap landed, the field
 * reported `focused="true"`, `input text` was issued — and `otp-input` still read `text=""`, so
 * `verify-otp-button` stayed `enabled="false"` and the tap on it did nothing. Typing the same string
 * by hand a moment later worked, which is what makes it a RACE rather than a broken command: on this
 * emulator the field can be focused before the IME has finished binding to it, and a keystroke sent
 * into that window is dropped.
 *
 * So this reads the value back. `text="…"` is in the uiautomator tree for both fields on this flow,
 * so the check needs nothing the dump does not already carry.
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

/** Rewind, shoot descending viewports, stitch ONE full-page PNG (docs/screens/android/README.md). */
async function stitchFull(
  name,
  band = { top: TOP, bottom: BOT },
  fab = null,
  shots = 8,
  step = { swipe: 600, maxScroll: 900 },
) {
  const dest = join(OUT, `${name}.png`);
  mkdirSync(dirname(dest), { recursive: true });
  for (let i = 0; i < 6; i++) {
    adb('shell', 'input', 'swipe', '540', '700', '540', '1800', '300');
    await delay(500);
  }
  await delay(900);
  const frames = [];
  for (let i = 0; i < shots; i++) {
    const p = join(TMP, `vw_${name.replace(/[^a-z0-9]/gi, '_')}_${i}.png`);
    grab(p);
    frames.push(p);
    if (i < shots - 1) {
      adb('shell', 'input', 'swipe', '540', '1700', '540', String(1700 - step.swipe), '500');
      await delay(1500);
    }
  }
  const extra = fab === null ? [] : ['--fab', fab.join(',')];
  extra.push('--max-scroll', String(step.maxScroll));
  process.stdout.write(
    execFileSync(
      'python',
      [STITCH, dest, String(band.top), String(band.bottom), ...extra, ...frames],
      { encoding: 'utf-8' },
    ),
  );
  console.log(`  stitched ${name}.png`);
}

/**
 * One frame, cropped to the standard band — for a screen that does not scroll at page level.
 *
 * The stitcher is given a single input; with nothing to correlate it crops and writes, which is
 * exactly what is wanted here and is honest about the screen being one viewport tall.
 */
async function shootOne(name) {
  const dest = join(OUT, `${name}.png`);
  mkdirSync(dirname(dest), { recursive: true });
  const frame = join(TMP, `vw_${name.replace(/[^a-z0-9]/gi, '_')}.png`);
  grab(frame);
  process.stdout.write(
    execFileSync('python', [STITCH, dest, String(TOP), String(BOT), frame], { encoding: 'utf-8' }),
  );
  console.log(`  shot ${name}.png`);
}

const ONLY = new Set(process.argv.slice(2));
const wanted = (key) => ONLY.size === 0 || ONLY.has(key);

const METRO_PORT = process.env['METRO_PORT'] ?? '8081';

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

/** Scroll the drawer panel to its foot. x=540 stays inside it; a backdrop swipe would close it. */
async function scrollDrawerToFoot() {
  for (let i = 0; i < 5; i++) {
    adb('shell', 'input', 'swipe', '540', '1800', '540', '900', '400');
    await delay(400);
  }
  await delay(800);
}

/**
 * Open the drawer and tap a row — expanding "More" first when the row is behind it.
 *
 * BOTH NEW ROWS ARE BEHIND "MORE", AND THAT IS NOT A BUG TO ROUTE AROUND. `drawerSectionFor` folds
 * at `DRAWER_MAX_ROWS` = 7 and this role's list is one of the longest in the app: §6.8 grants it
 * Procurement (all) and Finance (all), which is six derived rows before anything else, and
 * `NOT_DERIVED` rows — which is what `/map` and `/insights` are — come last. So the panel shows six
 * rows and a "More (N)", and the row this function is reaching for only exists in the tree after
 * that is pressed. A first version tapped straight for the row, and `drawer-link-/map` would never
 * have appeared.
 */
async function openFromDrawer(route, what, screenId) {
  if (!(await present(byId('navigation-drawer')))) {
    await tap(byId('drawer-menu-button'), 'drawer button');
    await find(byId('navigation-drawer'), 'navigation drawer', 30);
    await delay(1500);
  }
  await scrollDrawerToFoot();
  if (!(await present(byId(`drawer-link-${route}`))) && (await present(byId('drawer-more')))) {
    console.log(`  · expanding the drawer's More row to reach ${route}`);
    await tap(byId('drawer-more'), 'drawer More row');
    await delay(1000);
    await scrollDrawerToFoot();
  }
  await tap(byId(`drawer-link-${route}`), what);
  await find(byId(screenId), what, 30);
}

// Targets: home projects map insights settings procurement budget
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
  // the text would be a tap on nothing — which is exactly how the first run stalled here.
  await tap(byId('verify-otp-button'), 'verify OTP button');

  // The project picker. This role IS staffed onto projects now (that is what makes the screens show
  // anything), so the shell may well raise it — and a raised sheet would sit over every frame.
  await find(byId('home-screen'), 'Viewer Home', 40).catch(() => undefined);
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

  await find(byId('home-screen'), 'Viewer Home', 40);

  if (wanted('home')) {
    console.log('· Home tab — the portfolio dashboard');
    // The KPI band waits on `refreshProjectsCache()`; the two counts under it come from the offline
    // caches, which fill as the delta sync lands. A frame taken early photographs the loader.
    await delay(6000);
    await stitchFull('01-Home/01-viewer-dashboard');
  }

  if (wanted('projects')) {
    console.log('· Projects tab');
    await tap(byId('projects-tab'), 'projects tab');
    await find(byId('projects-screen'), 'project list', 30);
    await delay(4000);
    await stitchFull('02-Projects/01-project-list');
  }

  if (wanted('map')) {
    console.log('· Project map, from the drawer');
    await openFromDrawer('/map', 'Project map', 'map-screen');
    await delay(2500);
    await shootOne('03-Map/01-project-map');
    // Back to a tab, so the drawer opens over a known screen for the next step.
    adb('shell', 'input', 'keyevent', '4');
    await delay(1500);
  }

  if (wanted('insights')) {
    console.log('· Project insights, from the drawer');
    await openFromDrawer('/insights', 'Project insights', 'insights-screen');
    await delay(2500);
    await stitchFull('04-Insights/01-project-insights');
    adb('shell', 'input', 'keyevent', '4');
    await delay(1500);
  }

  if (wanted('settings')) {
    console.log('· Account settings, from the drawer');
    await openFromDrawer('/account-settings', 'account settings', 'account-settings');
    // `GET /users/me` for the head, and the notification preferences below it.
    await delay(4000);
    await stitchFull('05-Profile/01-account-settings');
    // Back to a tab: the two below are tabs, and the tab bar is not on screen inside the drawer's
    // account-settings route.
    adb('shell', 'input', 'keyevent', '4');
    await delay(1500);
  }

  if (wanted('procurement')) {
    console.log('· Procurement tab — the viewer branch');
    await tap(byId('procurement-tab'), 'procurement tab');
    // `viewer-procurement`, NOT the manager dashboard's own id. If the branch ever regresses this
    // find times out rather than photographing the wrong screen under the right filename.
    await find(byId('viewer-procurement'), 'viewer procurement', 30);
    await delay(2500);
    await stitchFull('06-Procurement/01-procurement');
  }

  if (wanted('budget')) {
    console.log('· Budget tab — the viewer branch');
    await tap(byId('budget-tab'), 'budget tab');
    await find(byId('viewer-budget'), 'viewer budget', 30);
    // The tallest screen in the set (4,206px in the drawing) — ten shots rather than eight, or the
    // verified log at its foot never enters a frame.
    await delay(2500);
    await stitchFull('07-Budget/01-budget', { top: TOP, bottom: BOT }, null, 10);
  }

  console.log(`\nDone → ${OUT}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
