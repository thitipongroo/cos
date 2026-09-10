// Android CRM_SALES_MANAGER screenshot capture — adb/uiautomator only, like every sibling script.
//
// Produces, under docs/screens/android/12-crm-manager/:
//   01-Home/01-crm-dashboard          pipeline value, active leads, win rate, stage counts
//   02-Leads/01-leads-directory       search, state chips, AI score per lead
//   03-Pipeline/01-opportunities      forecast card, photo cards, convert
//   04-Customers/01-customers         relationship card, client cards
//   05-Profile/01-navigation-drawer   the grouped CRM menu
//   05-Profile/02-account-settings    the three grouped cards
//
// ── THE AUGUST RETIREMENT IS OVER, BY THE DECISION THAT ENDED IT ────────────────────────────────
//
// This role's capture path was RETIRED on 2026-08-11 by product-owner decision: the Leads,
// Opportunities and Customers frames were deleted and `capture-android-crm.mjs` was removed with
// them (docs/screens/android/README.md, "CRM Sales Manager — not captured"). The HOME DASHBOARD
// brought the file back on 2026-09-09 — it did not exist in August, when the role's Home tab
// rendered a 22-line placeholder — and it shot that one screen and nothing else, because adding the
// others back would have reversed a decision nobody had revisited.
//
// SOMEBODY REVISITED IT. The product owner asked on 2026-09-10 for the five remaining CRM screens
// to be implemented from Stitch and for each to be captured ("capture screen ที่ Implement ด้วย").
// All three retired frames are among them, so the retirement is lifted for exactly those and the
// two profile screens join them. Nothing else changed about how they are shot.
//
// PATH A. `MFA_ROLES` in `backend/prisma/provision-keycloak-demo.ts` is `{TENANT_ADMIN, FINANCE}`,
// and this role is in neither, so the ordinary phone-OTP flow works.
//
// LOGS IN AS THE SEEDED CRM MANAGER — `+66811000012`, Chalermsak Nithat
// (backend/prisma/seed-realistic.ts).
//
// Prerequisites: docker compose up (including the `full` profile for Keycloak) + backend on :3000 +
// seeded demo data, emulator booted with the debug APK, and Metro started with EXPO_PUBLIC_CAPTURE=1.
// Run: node scripts/capture-android-crm.mjs

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../../docs/screens/android/12-crm-manager');
const TMP = process.env['TEMP'] ?? process.env['TMP'] ?? HERE;
const STITCH = join(HERE, 'stitch-fullpage.py');
const PKG = 'com.constructionos.cos';

const OTP_PHONE = process.env['E2E_OTP_PHONE'] ?? '0811000012';
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

/**
 * A node's `[x1,y1][x2,y2]` box, for `stitch-fullpage.py --fab`.
 *
 * A floating button is absolutely positioned, so it appears in EVERY frame the stitcher takes and
 * a long page ends up with a column of them. The stitcher erases it from each shot and redraws it
 * once, but only when it is told where the button is.
 */
async function boundsOf(pred, what) {
  const node = (await dump()).find((n) => pred(n) && n.includes('bounds='));
  if (!node) throw new Error(`capture: ${what} never appeared`);
  const m = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node);
  return [+m[1], +m[2], +m[3], +m[4]];
}

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
/**
 * Photograph a scrolling screen and stitch it into one full-page PNG.
 *
 * @param name  destination, relative to OUT and without the extension
 * @param band  which rows scroll. Defaults to the fixed TOP/BOT pair; an OVERLAY that covers the
 *              chrome — the drawer — passes its own.
 * @param fab   `[x0,y0,x1,y1]` for a control PINNED inside the scrolling band, or null. A fixed
 *              element lands in every shot and the stitcher needs to know so it can erase it from
 *              the content and draw it once.
 * @param shots how many viewports to walk.
 * @param step  how far one swipe drags, and with it the stitcher's `--max-scroll`.
 *
 *              MAX_SCROLL MUST STAY BELOW THE PAGE'S ROW PITCH. That is the whole rule, and it cost
 *              the FINANCE invoice list three re-shoots to learn: the comparison window is
 *              `content_h - max_scroll`, so at a max-scroll equal to the card pitch the matcher can
 *              slide a whole card and still call it a match — which printed one invoice over
 *              another. The order and delivery cards here run 400-700px, so the pairs below stay
 *              under that.
 */
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
    const p = join(TMP, `pm_${name.replace(/[^a-z0-9]/gi, '_')}_${i}.png`);
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

const ONLY = new Set(process.argv.slice(2));
const wanted = (key) => ONLY.size === 0 || ONLY.has(key);

/**
 * Which host port Metro is on.
 *
 * The device always asks for 8081 — that is baked into the dev-client build — so the reverse tunnel
 * maps device:8081 to whatever host port Metro actually took.
 */
const METRO_PORT = process.env['METRO_PORT'] ?? '8081';

/**
 * A node whose bounds are a real rectangle.
 *
 * uiautomator happily reports an inverted box for a row that is half-scrolled — bottom above top —
 * and a centre computed from one lands somewhere else entirely. At the foot of the drawer, that
 * somewhere else is the logout row.
 */
function hasRealBounds(node) {
  const m = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node);
  if (!m) return false;
  return Number(m[3]) > Number(m[1]) && Number(m[4]) > Number(m[2]);
}

// Targets: home leads opportunities customers drawer settings
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

  // The project picker, if the shell raises it. This role sells projects rather than being staffed
  // onto them, so it usually does not — but the check costs nothing and a raised sheet would
  // otherwise sit over the dashboard in every frame.
  await find(byId('home-screen'), 'CRM manager Home', 40).catch(() => undefined);
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

  await find(byId('home-screen'), 'CRM manager Home', 40);

  if (wanted('home')) {
    console.log('· Home tab — the CRM dashboard');
    // THREE REQUESTS SETTLE BEFORE THE TILES APPEAR: leads, opportunities and customers. <KpiRegion />
    // holds a loader over the whole block until all three land, so a frame taken early is a picture
    // of the skeleton rather than of the screen.
    await delay(6000);
    await stitchFull('01-Home/01-crm-dashboard');
  }

  // The three list tabs. Each opens on a <LoadingBoundary> over its whole region (Rule 40), so a
  // frame taken before the fetch settles is a picture of the loader; 4s is what the dashboard's
  // three-request wait above proved sufficient for one request on this emulator, doubled.
  if (wanted('leads')) {
    console.log('· Leads tab');
    await tap(byId('leads-tab'), 'leads tab');
    await find(byId('leads-screen'), 'Leads directory', 30);
    await delay(4000);
    await stitchFull(
      '02-Leads/01-leads-directory',
      undefined,
      await boundsOf(byId('create-lead-fab'), 'lead FAB'),
    );
  }

  if (wanted('opportunities')) {
    console.log('· Opportunities tab');
    await tap(byId('opportunities-tab'), 'opportunities tab');
    await find(byId('opportunities-screen'), 'Opportunities', 30);
    // Two requests here, not one: the list and the leads the create sheet picks from.
    await delay(5000);
    await stitchFull(
      '03-Pipeline/01-opportunities',
      undefined,
      await boundsOf(byId('create-opportunity-fab'), 'opportunity FAB'),
    );
  }

  if (wanted('customers')) {
    console.log('· Customers tab');
    await tap(byId('customers-tab'), 'customers tab');
    await find(byId('customers-screen'), 'Customers', 30);
    await delay(4000);
    await stitchFull('04-Customers/01-customers');
  }

  // THE DRAWER IS AN OVERLAY OVER THE WHOLE SCREEN, TopBar included — it is `StyleSheet.
  // absoluteFill` with elevation 32, so the usual 200..2196 band would cut its brand row off the
  // top and its logout button off the bottom. It is shot edge to edge below the status bar instead.
  //
  // ITS MENU SCROLLS, AND `stitchFull` CANNOT SEE THAT IT DOES.
  //
  // The CRM drawer is a profile block, four titled groups, thirteen rows and a logout button —
  // more than one screen. `shots: 4` was tried on 2026-09-10 and the stitcher answered
  // `bottom reached (scroll~0)` on every frame after the first, so the file shipped cut off at the
  // third group. The reason is structural: it finds the scroll by correlating whole ROWS of a
  // 1080px-wide frame, and on an open drawer almost none of a row moves — the right ~220px is the
  // dimmed backdrop, the profile card sits ABOVE the ScrollView, and the logout button is pinned
  // below it. What travels is a window in the middle of a 310dp panel.
  //
  // So this does not correlate anything. It reads the scroll OFF THE TREE: the y of one row before
  // the swipe and after it, which is the exact number of pixels the list moved. `stitch-drawer.py`
  // pastes only those pixels in. Every output row was on the screen; none is interpolated.
  if (wanted('drawer')) {
    console.log('· Navigation drawer');
    await tap(byId('drawer-menu-button'), 'drawer button');
    await find(byId('navigation-drawer'), 'navigation drawer', 30);
    // Two list requests badge the Leads and Pipeline rows.
    await delay(4000);

    // The scrolling window: from the first row under the static profile card to the top of the
    // pinned logout button. Both are read, not assumed — the panel's height depends on the
    // handset's safe-area inset, and the profile card's on whether the account has a position.
    const firstRow = await boundsOf(byId('drawer-link-/home'), 'first drawer row');
    const logout = await boundsOf(byId('drawer-logout'), 'logout button');
    const region = [firstRow[1], logout[1]];

    const top = join(TMP, 'crm_drawer_top.png');
    grab(top);

    // ANCHOR ON A ROW THAT SURVIVES THE SCROLL. `/customers` is the last row of the first group,
    // far enough down to still be on screen at the bottom of a short list and far enough up not to
    // be the row that leaves it. Its travel IS the list's travel.
    const before = await boundsOf(byId('drawer-link-/customers'), 'anchor row');
    for (let i = 0; i < 5; i++) {
      adb('shell', 'input', 'swipe', '400', '1900', '400', '1000', '400');
      await delay(400);
    }
    await delay(900);
    const after = await boundsOf(byId('drawer-link-/customers'), 'anchor row after the scroll');
    const scrolled = before[1] - after[1];

    const bottom = join(TMP, 'crm_drawer_bottom.png');
    grab(bottom);

    const dest = join(OUT, '05-Profile/01-navigation-drawer.png');
    mkdirSync(dirname(dest), { recursive: true });
    process.stdout.write(
      execFileSync(
        'python',
        [
          join(HERE, 'stitch-drawer.py'),
          dest,
          top,
          bottom,
          '--scroll',
          String(scrolled),
          '--region',
          String(region[0]),
          String(region[1]),
        ],
        { encoding: 'utf-8' },
      ),
    );
    console.log('  stitched 05-Profile/01-navigation-drawer.png');
  }

  if (wanted('settings')) {
    console.log('· Account settings, from the drawer');
    if (!(await present(byId('navigation-drawer')))) {
      await tap(byId('drawer-menu-button'), 'drawer button');
      await find(byId('navigation-drawer'), 'navigation drawer', 30);
      await delay(1500);
    }
    // THE SETTINGS ROW IS IN THE DRAWER'S LAST GROUP, and on a fresh drawer that is below the
    // fold — the first run tapped a row that was not on screen and the screen never opened. Scroll
    // the panel down before reaching for it. Harmless when the drawer step ran just before this
    // one and already left it at the bottom. Swiping at x=400 stays inside the panel; a swipe on
    // the backdrop would close the drawer instead.
    for (let i = 0; i < 5; i++) {
      adb('shell', 'input', 'swipe', '540', '1800', '540', '900', '400');
      await delay(400);
    }
    await delay(800);
    await tap(byId('drawer-link-/account-settings'), 'Settings row');
    await find(byId('account-settings'), 'account settings', 30);
    // `GET /users/me` for the head, and the notification preferences below it.
    await delay(4000);
    await stitchFull('05-Profile/02-account-settings');
  }

  console.log(`\nDone → ${OUT}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
