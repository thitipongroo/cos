// Android EXECUTIVE screenshot capture — adb/uiautomator only, like every sibling script.
//
// Writes the role's screens into docs/screens/android/08-executive/:
//   01-Home/01-ex-home-dashboard    AI brief with its CONF chip and SOURCES footer · the ACTIVE and
//                                    RISKS tiles · the portfolio budget with its two-segment bar ·
//                                    the project list · the locations panel
//   02-Alerts/01-ex-alerts          the portfolio task roll-up — overdue / due-this-week / blocked,
//                                    the AI delay-risk feed, and the critical path. NOT the risk
//                                    feed: that screen was deleted on 2026-09-07 (PO), because the
//                                    drawing behind this tab is the previous Tasks drawing with
//                                    four <nav> labels changed and a byte-identical body
//   03-Portfolio/01-ex-portfolio    search · four filter chips with real counts · the risk sort ·
//                                    the summary strip · project cards with the health matrix
//   04-Report/01-ex-report          the AI strategic brief · the three drawn metrics · project
//                                    summaries · the model's own strategic recommendations
//   05-Drawer/01-ex-navigation-drawer
//                                   the role's drawer — an OVERLAY opened from the TopBar, not a
//                                   fifth tab; its rows come from the §6.4 matrix via drawerLinks.ts
//   06-Off-bar/01-ex-safety         compliance · active incidents · six-month trend · the ranking
//   06-Off-bar/02-ex-more           the seven tiles, three of them unbuilt
//
// `/tasks` IS NOT SHOT ANY MORE, and its absence is the point rather than an omission: the screen
// it holds for this role is the Alerts tab above, and the role left the DERIVED "Tasks" drawer row
// so one screen is not offered under two names. Photographing it here would put the same frame in
// the folder twice under two file names.
//
// THE BAR IS Home | Alerts | Portfolio | Reports since 2026-09-07 (PO decision, ADR-098 as
// amended). It has changed twice: it was Home | Portfolio | Alerts | Reports until 2026-09-05, then
// Home | Tasks | Safety | More until the product owner replaced `mockup/mobile/08_executive/`
// wholesale. It is NOT the first bar restored — Alerts and Portfolio have swapped places.
//
// SAFETY AND MORE ARE STILL SHOT, and that is the reason the sixth directory exists. Both left the
// bar in the same change and the product owner kept them, reached from the drawer, so they are
// photographed the way a user now gets to them — TopBar menu, then the row — under `06-Off-bar/`
// rather than under a tab number they no longer own. A screen that stopped being captured because
// it stopped being a tab is a screen nobody looks at again.
//
// LOGS IN AS THE SEEDED EXECUTIVE — `+66811000001`, Wichai Ekachai (backend/prisma/
// seed-realistic.ts). Path A (phone + OTP), like every other capture script here.
//
// NO PROJECT PICKER FOR THIS ROLE. Every screen here is a PORTFOLIO view — the task roll-up is
// tenant-wide, the safety figures are tenant-wide, and the project list is the whole list — so the
// shell raises no <SelectProjectSheet /> and the script does not answer one. The one per-project
// call, the critical path, reports on the executive's first project and names it on screen.
//
// SEVERAL FIGURES IN THESE FRAMES DID NOT COME FROM THE BACKEND, and that is a recorded decision
// rather than a broken capture. Nineteen of them, listed in ADR-099 and living in one module,
// apps/mobile/src/lib/mockupFigures.ts: the compliance percentage and its grade, safe man-hours,
// the six-month trend, the per-project safety score, the "+2 this month" delta, the per-project
// sync chip, the locations panel, the portfolio health score, each card's contract number and
// location, three of the four health pillars, the per-card index, the Report brief's three metrics
// and its PDF button.
//
// Everything else in these frames is live data from the seeded tenant — the portfolio budget and
// variance, every filter count and sort order, the task counts, the critical path, the incident
// counts, and every AI panel including the Report screen's recommendations and risk flags, which
// are real fields on the report the gateway returned.
//
// Prerequisites, in order:
//   1. `make docker-up-full` — ClickHouse is a `full`-profile service and the Home screen's budget,
//      variance and risk figures all come from /analytics/executive, which reads it
//   2. `npx ts-node prisma/seed-realistic.ts` (from backend/) — the Postgres demo tenant
//   2a. `npx ts-node prisma/provision-keycloak-demo.ts` (from backend/) — the SAME users in
//       Keycloak. seed-realistic.ts writes Postgres only, and Path A's verify step exchanges the
//       OTP for a session through the identity provider, so without this the realm has no account
//       to grant and the backend answers COS-AUTH-503 — which the app shows as "Invalid or
//       expired OTP". Being reachable is not enough; the realm has to know the user.
//   3. `node prisma/seed-analytics-clickhouse.mjs` (from backend/) — MIRRORS those Postgres figures
//      into the ClickHouse aggregate tables. WITHOUT IT THE HOME SCREEN PHOTOGRAPHS EM DASHES: the
//      tables are written in production by services/analytics-worker consuming Kafka, and that
//      worker fills them FORWARD from events, so a machine seeded straight into Postgres has an
//      empty OLAP store and /analytics/executive answers []
//   4. backend on :3000 with E2E_AUTH_BYPASS=true
//   4a. KEYCLOAK RUNNING on :8090. Path A looks like it has nothing to do with Keycloak — it is
//       phone + SMS OTP — but verifyOtp mints the session through the identity provider, so with
//       Keycloak down the backend answers COS-AUTH-503 "Identity provider unavailable" and the
//       app renders the generic "Invalid or expired OTP. Please try again." The OTP is fine and
//       the screen says otherwise, which cost three runs on 2026-09-05 before the API was called
//       directly. NOTE: `backend/src/workers/__tests__/main.spec.ts` binds port 8090 itself, so it
//       fails while Keycloak holds it — run the unit suite with Keycloak stopped, and the capture
//       with it started.
//   5. emulator booted with the debug APK installed
//   6. Metro started with EXPO_PUBLIC_CAPTURE=1 (mutes the dev LogBox toast, freezes animation loops)
// Run: node scripts/capture-android-executive.mjs
//      node scripts/capture-android-executive.mjs portfolio   ← re-shoot one screen only
// Targets: home · alerts · portfolio · reports · drawer · safety · more

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../../docs/screens/android/08-executive');
const TMP = process.env['TEMP'] ?? process.env['TMP'] ?? HERE;
const STITCH = join(HERE, 'stitch-fullpage.py');
const PKG = 'com.constructionos.cos';

const OTP_PHONE = process.env['E2E_OTP_PHONE'] ?? '0811000001';
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

/**
 * One uiautomator dump, retried.
 *
 * "ERROR: could not get idle state." is the failure to expect here, and it has TWO causes on this
 * device. The first is device animation scales, which `main()` sets to 0 before anything else. The
 * second cannot be turned off: the OTP screen's "Resend in Ns" countdown rewrites itself every
 * second, so the window is never idle while it runs, and every dump in that window fails. The
 * retries below are what carries the script across it — the countdown reaches zero, the text stops
 * changing, and the next dump succeeds. Do not shorten them.
 */
/** One dump attempt. `null` means uiautomator refused — the window was not idle. */
function dumpOnce() {
  adb('shell', 'rm', '-f', '/sdcard/ui.xml');
  if (!adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml').includes('dumped to')) return null;
  return adb('shell', 'cat', '/sdcard/ui.xml').split('<');
}

async function dump() {
  for (let i = 0; i < 12; i++) {
    const nodes = dumpOnce();
    if (nodes) return nodes;
    await delay(1000);
  }
  throw new Error('capture: uiautomator never produced a dump');
}

/**
 * Does this node have a real, upright box — or is it a row clipped at the edge of a scroll view?
 *
 * A PARTLY SCROLLED-OFF ROW REPORTS INVERTED BOUNDS on this device, and the failure that produces
 * is silent and destructive. Measured on 2026-09-07 with the drawer scrolled to its foot:
 *
 *   drawer-link-/safety   bounds="[63,2254][751,2148]"   ← bottom ABOVE top
 *   drawer-logout         bounds="[63,2148][751,2263]"
 *
 * `centreOf` averages those two y values into 2201, which is inside the LOGOUT row — so the script
 * found the right node, computed a point that belongs to a different one, and signed the session
 * out. The run then failed several steps later with "…-screen never appeared", pointing nowhere
 * near the cause. Anything that scrolls to reach a target must check this before tapping.
 */
function hasRealBounds(node, minHeight = 40) {
  const m = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node);
  return m !== null && +m[4] - +m[2] >= minHeight && +m[3] - +m[1] > 0;
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

/**
 * Did SEND OTP advance the screen to the verify step?
 *
 * Asked this way round, and not by looking for `otp-input`, because the OTP screen is the one screen
 * in this flow that CANNOT be dumped reliably: its "Resend in Ns" countdown rewrites itself every
 * second, so `uiautomator dump` answers "ERROR: could not get idle state." for as long as the
 * countdown runs. A failed dump and a missing node are the same value to `find()`, which is how a
 * successful request came to be reported as a rejected one (see the call site).
 *
 * The phone step, by contrast, is static and dumps on the first attempt. So:
 *   - a dump that FAILS means the window is animating or rewriting itself — not the phone step
 *   - a dump that succeeds and still carries `request-otp-button` means the request did NOT go through
 *   - a dump that succeeds and carries `otp-input` is the plain success case
 * Only the middle case is evidence of a failed request, and only it presses the button again.
 */
async function otpStepReached(deadlineMs = 45_000) {
  const until = Date.now() + deadlineMs;
  while (Date.now() < until) {
    const nodes = dumpOnce();
    if (!nodes) return true; // not idle ⇒ not the static phone step ⇒ the screen moved on
    if (nodes.some((n) => byId('otp-input')(n))) return true;
    await delay(1000);
  }
  return false;
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
 * @param name  output path under OUT, without the extension
 * @param band  the rows to stitch. Defaults to the page band — below the TopBar, above the bottom
 *              nav — which is right for a TAB. The navigation drawer is an overlay covering both,
 *              so it passes its own: the status bar stays excluded (its clock changes between shots
 *              and would defeat the stitcher's overlap search) but everything under it is the
 *              drawer's own surface.
 */
async function stitchFull(name, band = { top: TOP, bottom: BOT }) {
  const dest = join(OUT, `${name}.png`);
  mkdirSync(dirname(dest), { recursive: true });
  for (let i = 0; i < 6; i++) {
    adb('shell', 'input', 'swipe', '540', '700', '540', '1800', '300');
    await delay(500);
  }
  await delay(900);
  const shots = [];
  for (let i = 0; i < 8; i++) {
    const p = join(TMP, `ex_${name.replace(/[^a-z0-9]/gi, '_')}_${i}.png`);
    grab(p);
    shots.push(p);
    if (i < 7) {
      adb('shell', 'input', 'swipe', '540', '1700', '540', '900', '500');
      await delay(1200);
    }
  }
  // No `--fab` argument anywhere in this role: EXECUTIVE is read-only on mobile (master §Phase 10),
  // so none of its four screens pins a floating action button inside the scrolling band.
  process.stdout.write(
    execFileSync('python', [STITCH, dest, String(band.top), String(band.bottom), ...shots], {
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

  // ANIMATIONS OFF, OR NOTHING BELOW WORKS. `uiautomator dump` waits for the UI to reach an idle
  // state and gives up with "ERROR: could not get idle state." while anything is still animating —
  // and with the AVD's default scales of 1.0, every screen transition keeps it busy long enough that
  // the dump fails outright. `dump()` retries, `find()` retries around it, and the run still dies
  // several minutes later with "… never appeared", which reads like a missing testID rather than a
  // device setting. Observed on a fresh Medium_Phone AVD on 2026-09-05.
  //
  // These are global device settings, not app state, so `pm clear` does not restore them and they
  // persist for the session. Restored to 1.0 at the end of a successful run.
  for (const setting of [
    'window_animation_scale',
    'transition_animation_scale',
    'animator_duration_scale',
  ]) {
    adb('shell', 'settings', 'put', 'global', setting, '0');
  }

  adb('shell', 'am', 'force-stop', PKG);
  adb('shell', 'pm', 'clear', PKG);
  adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
  console.log('· app launched, waiting for the JS bundle');
  await delay(30_000);

  console.log(`· Path A login as ${OTP_PHONE}`);
  await tap(byId('phone-input'), 'phone input');
  await type(OTP_PHONE);
  await hideKeyboard();
  // THE SECOND PRESS IS A FALLBACK, NOT AN EXPECTED STEP — and the reason written here on
  // 2026-09-05 was wrong. It claimed the first request after `pm clear` is rejected while the app
  // registers its device, and that the screen shows "Could not send OTP. Check the phone number and
  // try again." Measured again the same day with a logging proxy between the device and the backend:
  // six consecutive clean installs (`pm clear` → launch → ONE press) each advanced straight to the
  // verify step, and the proxy recorded the first request arriving complete with its `deviceId` and
  // answering 200 in 11 ms every time. There is no first-launch race to work around.
  //
  // What fired the old branch was the DUMP, not the request: it decided by calling
  // `find(byId('otp-input'), …)` on the one screen uiautomator cannot dump while its resend
  // countdown is running, so an unreadable screen was read as a failed login and reported as one.
  // `otpStepReached()` above tells those two apart.
  await tap(byId('request-otp-button'), 'request OTP button');
  if (!(await otpStepReached())) {
    console.log('· SEND OTP left the phone step on screen — the request failed; pressing again');
    await tap(byId('request-otp-button'), 'request OTP button (retry)');
    if (!(await otpStepReached())) throw new Error('capture: the OTP step was never reached');
  }
  await tap(byId('otp-input'), 'OTP input');
  await type(OTP_CODE);
  await hideKeyboard();
  await tap(byId('verify-otp-button'), 'verify OTP button');

  // The destination, asserted rather than slept on — a mis-tap fails the run instead of being
  // photographed as if it were the dashboard.
  await find(byId('home-screen'), 'executive Home', 40);

  if (wanted('alerts')) {
    console.log('· Alerts tab (the portfolio task roll-up)');
    await tap(byId('alerts-tab'), 'Alerts tab');
    // `exec-tasks-screen`, not `alerts-screen`: this route renders <ExecTasks /> since 2026-09-07.
    await find(byId('exec-tasks-screen'), 'exec-tasks-screen', 20);
    // Three requests settle here — the roll-up, the project list, then the critical path, which
    // cannot start until the list answers — plus a metered AI call for the risk feed. Waiting for
    // the slowest keeps an empty Critical Path section out of the frame when it is merely late
    // rather than absent.
    await delay(6000);
    await stitchFull('02-Alerts/01-ex-alerts');
  }

  if (wanted('portfolio')) {
    console.log('· Portfolio tab');
    await tap(byId('portfolio-tab'), 'Portfolio tab');
    await find(byId('portfolio-screen'), 'portfolio-screen', 20);
    // The list renders instantly from the offline cache; the chips' counts, the summary strip
    // and every card's band wait on /analytics/executive, and the progress bars on
    // /projects/mine.
    await delay(3500);
    await stitchFull('03-Portfolio/01-ex-portfolio');
  }

  if (wanted('reports')) {
    console.log('· Reports tab (AI — the longest wait on this bar)');
    await tap(byId('reports-tab'), 'Reports tab');
    await find(byId('exec-reports-screen'), 'exec-reports-screen', 20);
    // THREE things settle, and the third is an LLM call: the project list, the analytics rows,
    // then POST /ai/reports/executive-summary, whose prose, confidence, recommendations and
    // risk flags are four separate places on this screen. A short wait photographs the loader.
    await delay(9000);
    await stitchFull('04-Report/01-ex-report');
  }

  // ── OFF THE BAR SINCE 2026-09-07, and reached the way a user now reaches them ────────────
  //
  // Opening the drawer and tapping the row is not a convenience here — it IS the entry point the
  // product owner kept these two screens for, so a run that failed to find the row would be telling
  // us the drawer derivation broke, which no other frame in this script would catch.
  const fromDrawer = async (route, screenId, label) => {
    await tap(byId('drawer-menu-button'), 'drawer menu button');
    await find(byId('navigation-drawer'), 'navigation drawer', 20);
    // THE ROW TAKES TWO STEPS TO REACH, and both were learned here rather than assumed.
    //
    // 1. The drawer shows SIX rows and hides the rest behind its own "More (N)" expander (PO
    //    decision 2026-08-10). This role derives TWENTY, so most of the list is behind it.
    // 2. Expanded, the list is longer than the screen and scrolls. `/safety` and `/more` were
    //    added to the foot of NOT_DERIVED on 2026-09-07, so they are the LAST two rows — past
    //    the bottom even once the list is open.
    //
    // THE EXPANDER TOGGLES AND THE DRAWER REMEMBERS. `expanded` is state inside a component
    // that stays mounted between opens, so the second visit finds it already open and a blind
    // tap COLLAPSES it — which is how the first attempt at this hid the row it was looking for.
    // Hence two sweeps: scroll looking for the row, toggle, scroll again. Whichever way round
    // the expander started, one of the two passes has it open.
    // `hasRealBounds` is what makes the sweep stop in the right place: a row that is HALF off
    // the bottom is present in the dump and would satisfy a plain id match, but its centre lands
    // on the row below it. See that helper for what that cost.
    const rowPred = (n) => byId(`drawer-link-${route}`)(n) && hasRealBounds(n);
    const rowVisible = async () => (await dump()).some(rowPred);
    let reached = false;
    for (let pass = 0; pass < 2 && !reached; pass++) {
      for (let i = 0; i < 8; i++) {
        if (await rowVisible()) {
          reached = true;
          break;
        }
        adb('shell', 'input', 'swipe', '300', '1900', '300', '1000', '400');
        await delay(800);
      }
      if (reached) break;
      await tap(byId('drawer-more'), 'drawer More expander');
      // Back to the top, so the second sweep starts where the first one did.
      for (let i = 0; i < 4; i++) {
        adb('shell', 'input', 'swipe', '300', '1000', '300', '1900', '400');
        await delay(400);
      }
    }
    // LET THE LIST SETTLE BEFORE TAPPING. `tap()` finds the node's bounds and then sends the
    // touch as two separate adb calls; while the drawer is still gliding under its own
    // momentum those bounds go stale between the two, and the tap lands on whatever has
    // slid into that row's place — which at the foot of this list is the LOGOUT row, so the
    // run ends back on the login screen with no obvious cause.
    await delay(1800);
    await tap(rowPred, `${label} drawer row`);
    await find(byId(screenId), screenId, 20);
  };

  if (wanted('safety')) {
    console.log('· Safety (drawer row)');
    await fromDrawer('/safety', 'safety-screen', 'Safety');
    await delay(3000);
    await stitchFull('06-Off-bar/01-ex-safety');
  }

  if (wanted('more')) {
    console.log('· More (drawer row)');
    await fromDrawer('/more', 'exec-more-screen', 'More');
    await delay(2500);
    await stitchFull('06-Off-bar/02-ex-more');
  }

  // HOME IS SHOT LAST, for the reason the project-manager and safety-officer scripts document: a
  // dashboard photographed seconds after sign-in can catch its own load losing a race with the
  // session. This screen refetches on focus, so returning to the tab at the end photographs
  // settled data — and this one has the most to settle, with the analytics roll-up behind every
  // figure and an AI brief that generates on mount.
  if (wanted('home')) {
    console.log('· Home tab (last — see the note above)');
    await tap(byId('home-tab'), 'Home tab');
    await find(byId('home-screen'), 'executive Home', 20);
    await delay(8000);
    await stitchFull('01-Home/01-ex-home-dashboard');
  }

  // THE DRAWER IS NOT A TAB. `05_profile/01_ex_navigation_drawer` is the overlay every role opens
  // from the TopBar, not a fifth destination in the bottom bar — ADR-098 settled that bar at
  // four. It is shot last of all, and after Home, because it is opened FROM a tab and closing it
  // returns to whatever was underneath.
  //
  // Its rows are the role's own: `drawerSectionFor(EXECUTIVE)` derives them from the §6.4
  // permission matrix, so this frame is the picture of that derivation — and since 2026-09-07 it
  // is also the picture of how Tasks, Safety and More are reached at all.
  if (wanted('drawer')) {
    console.log('· Navigation drawer (overlay, opened from the TopBar)');
    await tap(byId('home-tab'), 'Home tab');
    await find(byId('home-screen'), 'executive Home', 20);
    await tap(byId('drawer-menu-button'), 'drawer menu button');
    await find(byId('navigation-drawer'), 'navigation drawer', 20);
    await delay(1500);
    // The overlay covers the TopBar and the bottom nav, so the page band would crop its own
    // header and its logout row. 96 clears the status bar; 2400 is the foot of the screen.
    await stitchFull('05-Drawer/01-ex-navigation-drawer', { top: 96, bottom: 2400 });
    // Leave it closed, so a re-run that starts on Home is not looking at yesterday's overlay.
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
    await delay(1200);
  }

  // Put the device back the way it was found. A developer who runs this and then uses the emulator
  // by hand should not be left wondering why every transition snaps.
  for (const setting of [
    'window_animation_scale',
    'transition_animation_scale',
    'animator_duration_scale',
  ]) {
    adb('shell', 'settings', 'put', 'global', setting, '1');
  }

  console.log(`\nDone → ${OUT}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
