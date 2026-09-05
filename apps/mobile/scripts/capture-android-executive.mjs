// Android EXECUTIVE screenshot capture — adb/uiautomator only, like every sibling script.
//
// Writes the four screens of the role's bar into docs/screens/android/08-executive/:
//   01-Home/01-ex-home-dashboard    AI panel · active-projects and risk tiles · portfolio budget
//                                    with its spend bar · the project list · the locations panel
//   02-Tasks/01-ex-tasks            overdue / due-this-week / blocked · AI risk alerts ·
//                                    the critical path
//   03-Safety/01-ex-safety          compliance · active incidents · six-month trend ·
//                                    the project ranking
//   04-More/01-ex-more              the seven tiles, three of them marked as unbuilt
//
// THE BAR IS Home | Tasks | Safety | More as the product owner settled it on 2026-09-04 (ADR-098),
// which is a CHANGE from Home | Portfolio | Alerts | Reports — the bar that agreed with spec
// §20.7.1 and master §Phase 10 until that day. `safety` is a new route, so its tab testID is
// `safety-tab`; `tasks` and `more` are shared routes whose screen branches on role.
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
// rather than a broken capture: the compliance percentage and its grade, safe man-hours, the
// six-month trend, the per-project safety score, the "+2 this month" delta, the per-project sync
// chip and the locations panel are the mockup's own numbers (ADR-099, product-owner decision
// 2026-09-04). They live in apps/mobile/src/lib/mockupFigures.ts. Everything else in these frames —
// the portfolio budget and variance, the task counts, the critical path, the incident counts and
// every AI panel — is live data from the seeded tenant.
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
//      node scripts/capture-android-executive.mjs safety   ← re-shoot one screen only

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
    execFileSync('python', [STITCH, dest, String(TOP), String(BOT), ...shots], {
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

  if (wanted('tasks')) {
    console.log('· Tasks tab');
    await tap(byId('tasks-tab'), 'Tasks tab');
    await find(byId('exec-tasks-screen'), 'exec-tasks-screen', 20);
    // Three requests settle here — the roll-up, the project list, then the critical path, which
    // cannot start until the list answers. Waiting for the slowest keeps an empty Critical Path
    // section out of the frame when it is merely late rather than absent.
    await delay(4000);
    await stitchFull('02-Tasks/01-ex-tasks');
  }

  if (wanted('safety')) {
    console.log('· Safety tab');
    await tap(byId('safety-tab'), 'Safety tab');
    await find(byId('safety-screen'), 'safety-screen', 20);
    await delay(3000);
    await stitchFull('03-Safety/01-ex-safety');
  }

  if (wanted('more')) {
    console.log('· More tab');
    await tap(byId('more-tab'), 'More tab');
    await find(byId('exec-more-screen'), 'exec-more-screen', 20);
    await delay(2500);
    await stitchFull('04-More/01-ex-more');
  }

  // HOME IS SHOT LAST, for the reason the project-manager and safety-officer scripts document: a
  // dashboard photographed seconds after sign-in can catch its own load losing a race with the
  // session. This screen refetches on focus, so returning to the tab at the end photographs settled
  // data — and this one has the most to settle, with the analytics roll-up behind every figure.
  if (wanted('home')) {
    console.log('· Home tab (last — see the note above)');
    await tap(byId('home-tab'), 'Home tab');
    await find(byId('home-screen'), 'executive Home', 20);
    await delay(4000);
    await stitchFull('01-Home/01-ex-home-dashboard');
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
