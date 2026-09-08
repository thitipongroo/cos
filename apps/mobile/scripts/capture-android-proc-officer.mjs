// Android PROCUREMENT_OFFICER screenshot capture — adb/uiautomator only, like every sibling script.
//
// Produces, under docs/screens/android/10-proc-officer/:
//   01-Home/01-po-dashboard        the 2x2 queue bento, the vendor-analysis module, the activity feed
//   02-RFQs/01-po-rfqs             search, counted status chips, the RFQ cards and their countdowns
//   03-Orders/01-po-order          search, counted chips, the delay alert, the order cards
//   04-Deliveries/01-po-delivery   the telemetry tiles, the logistics alert, the delivery cards
//   04-Deliveries/02-po-record     the record form behind them — PO picker, per-line quantities
//   05-Drawer/01-po-navigation-drawer
//                                  the role's drawer — an OVERLAY opened from the TopBar, not a
//                                  fifth tab; its rows come from the §6.4 matrix via drawerLinks.ts
//   05-Drawer/02-po-account-settings
//                                  Settings, pushed from that drawer
//
// PATH A, AND THAT IS THE DIFFERENCE FROM THE FINANCE SCRIPT. `MFA_ROLES` in
// `backend/prisma/provision-keycloak-demo.ts` is `{TENANT_ADMIN, FINANCE}`, and ADR-067 denies the
// direct grant to those two alone. PROCUREMENT_OFFICER is in neither set, so the ordinary phone-OTP
// flow every other capture script here uses works, and none of the FINANCE script's browser
// machinery — Chrome, PKCE, a TOTP computed from the realm secret — is needed or wanted.
//
// LOGS IN AS THE SEEDED PROCUREMENT OFFICER — `+66811000005`, Nattapong Wongchai
// (backend/prisma/seed-realistic.ts), department Procurement, position Procurement Officer.
//
// HOME IS SHOT LAST, on purpose. A dashboard photographed straight after sign-in races its own
// load: four requests are in flight and the tiles would be caught mid-dash. Every sibling script
// here does the same and for the same reason.
//
// SEVERAL PANELS PHOTOGRAPH AS DRAWN FIGURES, AND THAT IS THE RECORDED STATE, not a broken capture.
// The activity feed, the RFQ material titles, the delay alert and every delivery status pill have no
// column behind them — `procurement.deliveries` has no status column at all — and the product
// owner's standing ruling is to draw what the mockup draws, register it, and never mark it on
// screen. ADR-099's sixth amendment lists all ten. What IS real in these frames is the four queue
// counts, every RFQ number, status, deadline and quotation count, every order's number, status,
// amount and vendor name, and every delivery's note, date and purchase order.
//
// APPROVE IS NEVER PRESSED. The Orders screen offers it on a `PENDING_APPROVAL` order and it is a
// real `POST /procurement/purchase-orders/:poId/approve`; a run that pressed it would spend a demo
// approval and leave the next capture with one order fewer to photograph.
//
// Prerequisites: docker compose up + backend on :3000 + seeded demo data, emulator booted with the
// debug APK, and Metro started with EXPO_PUBLIC_CAPTURE=1 (mutes the dev LogBox toast, freezes
// animation loops).
// Run: node scripts/capture-android-proc-officer.mjs
//      node scripts/capture-android-proc-officer.mjs orders   ← re-shoot one screen only

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../../docs/screens/android/10-proc-officer');
const TMP = process.env['TEMP'] ?? process.env['TMP'] ?? HERE;
const STITCH = join(HERE, 'stitch-fullpage.py');
const PKG = 'com.constructionos.cos';

const OTP_PHONE = process.env['E2E_OTP_PHONE'] ?? '0811000005';
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
    const p = join(TMP, `po_${name.replace(/[^a-z0-9]/gi, '_')}_${i}.png`);
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

// Targets: home · rfqs · orders · deliveries · record · drawer · settings
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

  // The project picker, if this role is one the shell raises it for. Answered here rather than
  // skipped: `find` below would otherwise wait for a Home that the overlay is covering.
  await find(byId('home-screen'), 'procurement Home', 40).catch(() => undefined);
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

  // Asserted rather than slept on — a mis-tap fails the run instead of being photographed as if it
  // were the dashboard.
  await find(byId('home-screen'), 'procurement Home', 40);

  if (wanted('rfqs')) {
    console.log('· RFQs tab');
    await tap(byId('rfqs-tab'), 'RFQs tab');
    await find(byId('rfqs-screen'), 'rfqs-screen', 20);
    // The list lands first and the per-row quotation counts follow it, so the wait is for the
    // second wave — a shorter one photographs a column of em dashes where the counts belong.
    await delay(5000);
    // 45 RFQs at roughly 420px a card. A 500px swipe with a 700px search stays under that pitch.
    await stitchFull(
      '02-RFQs/01-po-rfqs',
      undefined,
      await boundsOf(byId('rfq-fab'), 'RFQ FAB'),
      5,
      { swipe: 500, maxScroll: 700 },
    );
  }

  if (wanted('orders')) {
    console.log('· Orders tab');
    await tap(byId('orders-tab'), 'Orders tab');
    await find(byId('orders-screen'), 'orders-screen', 20);
    // Four requests: the orders, the deliveries they are counted against, the vendor directory and
    // the caller's projects. The vendor names arrive with the third.
    await delay(4500);
    await stitchFull(
      '03-Orders/01-po-order',
      undefined,
      await boundsOf(byId('order-fab'), 'Order FAB'),
      5,
      { swipe: 500, maxScroll: 700 },
    );
  }

  if (wanted('deliveries')) {
    console.log('· Deliveries tab');
    await tap(byId('deliveries-tab'), 'Deliveries tab');
    await find(byId('deliveries-screen'), 'deliveries-screen', 20);
    await delay(3500);
    await stitchFull(
      '04-Deliveries/01-po-delivery',
      undefined,
      await boundsOf(byId('delivery-fab'), 'Delivery FAB'),
      4,
      { swipe: 500, maxScroll: 700 },
    );
  }

  if (wanted('record')) {
    console.log('· Delivery record form (behind the queue)');
    await tap(byId('deliveries-tab'), 'Deliveries tab');
    await find(byId('deliveries-screen'), 'deliveries-screen', 20);
    await delay(2500);
    await tap(byId('delivery-fab'), 'Delivery FAB');
    await find(byId('delivery-record-screen'), 'delivery-record-screen', 20);
    // Pick the first purchase order so the form is photographed with its line items on it — an
    // unpicked form is a picker and a blank space, which shows nothing about what the form does.
    const po = (await dump()).find((n) => /resource-id="po-option-/.test(n) && hasRealBounds(n));
    if (po) {
      const c = centreOf(po);
      adb('shell', 'input', 'tap', String(c.x), String(c.y));
      // The line items come from `GET /procurement/purchase-orders/:poId`, requested on the tap.
      await delay(3000);
    }
    await stitchFull('04-Deliveries/02-po-record');
  }

  if (wanted('home')) {
    console.log('· Home tab (last — see the note above)');
    await tap(byId('home-tab'), 'Home tab');
    await find(byId('home-screen'), 'procurement Home', 20);
    // Four requests in flight: purchase requests, RFQs + orders, deliveries, projects.
    await delay(5000);
    // Pinned like the other three: the button is a sibling of the scroller, not the last row of it.
    // It was the last row until the first capture caught it cut in half by the bottom nav.
    await stitchFull(
      '01-Home/01-po-dashboard',
      undefined,
      await boundsOf(byId('procurement-fab'), 'Home FAB'),
    );
  }

  if (wanted('drawer')) {
    console.log('· Navigation drawer (overlay, opened from the TopBar)');
    await tap(byId('home-tab'), 'Home tab');
    await find(byId('home-screen'), 'procurement Home', 20);
    await tap(byId('drawer-menu-button'), 'drawer menu button');
    await find(byId('navigation-drawer'), 'navigation drawer', 20);
    // The profile block's position and employee code come from `GET /users/me`, requested when the
    // drawer first opens rather than on mount.
    await delay(2500);
    // The overlay covers the TopBar and the bottom nav, so the fixed band would crop its own header
    // and its logout row. 96 clears the status bar; 2400 is the foot of the screen.
    await stitchFull('05-Drawer/01-po-navigation-drawer', { top: 96, bottom: 2400 });
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
    await delay(1200);
  }

  if (wanted('settings')) {
    console.log('· Account settings (pushed from the drawer)');
    await tap(byId('drawer-menu-button'), 'drawer menu button');
    await find(byId('navigation-drawer'), 'navigation drawer', 20);
    // Settings is a SHARED row, so it sits below the role's own section and above Sign Out — near
    // the foot of a list that scrolls. `hasRealBounds` is what stops the sweep on a row that is
    // fully on screen: a half-clipped row satisfies a plain id match and its centre lands on the
    // row below, which at the foot of this list is LOGOUT.
    const rowPred = (n) => byId('drawer-link-/account-settings')(n) && hasRealBounds(n);
    for (let i = 0; i < 8; i++) {
      if ((await dump()).some(rowPred)) break;
      adb('shell', 'input', 'swipe', '300', '1900', '300', '1000', '400');
      await delay(800);
    }
    // Let the list settle before tapping: `tap()` reads bounds and sends the touch as two separate
    // adb calls, and bounds go stale while the drawer is still gliding under its own momentum.
    await delay(1800);
    await tap(rowPred, 'Settings drawer row');
    await find(byId('account-settings-screen'), 'account-settings-screen', 20);
    await delay(2500);
    await stitchFull('05-Drawer/02-po-account-settings');
  }

  console.log(`\nDone → ${OUT}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
