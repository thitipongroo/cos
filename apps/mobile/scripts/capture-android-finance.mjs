// Android FINANCE screenshot capture — adb/uiautomator only, like every sibling script.
//
// Writes the role's screens into docs/screens/android/09-finance/:
//   01-Home/01-fn-dashboard        the pending-approval total summed in decimal.js · the cash-flow
//                                   tile and its risk word · the drawn burn rate · the 13-week
//                                   forecast card · the priority approval queue
//   02-Payments/01-fn-payment      the PENDING count and MFA chip · the vendor cards · the analysis
//                                   module · the drawn FAB
//   02-Payments/02-fn-payment-detail
//                                   the full-screen detail behind a card, with the biometric note
//                                   and the Approve / Dispute pair. NOT PRESSED — Approve is a real
//                                   `PATCH …/approve` and a capture that spends a demo payment
//                                   changes the tenant every run
//   03-Budget/01-fn-budget         Total / Actual / Remaining from the budget endpoint · the
//                                   forecast module · the category breakdown with its per-line
//                                   spend summed from cost transactions
//   04-Invoices/01-fn-invoice      the filter chips with the server's own counts · the drawn
//                                   3-way-matching banner · the invoice cards with their PO
//                                   reference, delivery state and Approve / Dispute pair
//   05-Drawer/01-fn-navigation-drawer
//                                   the role's drawer — an OVERLAY opened from the TopBar, not a
//                                   fifth tab; its rows come from the §6.4 matrix via drawerLinks.ts
//   05-Drawer/02-fn-account-settings
//                                   Settings, pushed from that drawer: MFA, biometric, PIN,
//                                   language, notifications, theme, version
//
// THE BAR IS Home | Payments | Budget | Invoices, and this work did not change it — `roleTabs.ts`
// and `context/phases/phase-10-mobile-offline-engine.md:192` already agreed on it, so unlike the
// EXECUTIVE set there was no navigation decision to take (PO decision 2026-09-08, ESC-1: keep it).
//
// LOGS IN AS THE SEEDED FINANCE OFFICER — `+66811000011`, Pimchanok Thongchai (backend/prisma/
// seed-realistic.ts).
//
// IT SIGNS IN THROUGH PATH B, BECAUSE PATH A IS DENIED FOR THIS ROLE. Measured on 2026-09-08 against
// a running realm, not inferred:
//
//   POST /api/v1/auth/otp/request  +66811000011  → 200
//   POST /api/v1/auth/otp/verify   +66811000011  → 503 COS-AUTH-503
//   backend log: keycloak.token.failed 401 "This role must sign in with email and password."
//   the same pair for +66811000002 (TENANT_ADMIN) → 503; for +66811000001 (EXECUTIVE) → 200 + token
//
// The realm's `direct-grant-mfa` flow carries a `conditional-user-attribute` on
// `role` matching `^(TENANT_ADMIN|FINANCE)$` followed by Deny access
// (`infrastructure/keycloak/realms/construction-os-realm.json`, authenticatorConfig
// `deny-privileged-direct-grant`). That is ADR-067 as amended on 2026-08-22: **privileged roles are
// Path B only, by product-owner decision of 2026-08-21.** `E2E_AUTH_BYPASS` does not help — it fixes
// the OTP CODE (`otp.service.ts`) and the exchange with the identity provider still happens.
//
// SO THIS SCRIPT LOGS IN THROUGH PATH B — `office-login-button`, which opens the system browser on
// Keycloak's own login page (Authorization Code + PKCE) and comes back through `cos://oauth2redirect`.
// The browser leg is driven with uiautomator like any other screen; Chrome exposes the page's fields
// as accessibility nodes AND PUBLISHES EACH INPUT'S HTML `id` AS ITS `resource-id`, so the realm's
// own markup — `username`, `password`, `kc-login`, `otp` — is what the browser leg matches on.
//
// IT NEEDS A TOTP SECRET, in `COS_CAPTURE_TOTP_SECRET`. Path B for this role demands a second factor
// — measured: a correct password answers `302 → required-action?execution=CONFIGURE_TOTP` — so the
// account has to HOLD one before the first capture. `provision-keycloak-demo.ts` now gives every
// role in its `MFA_ROLES` set a TOTP credential with a fixed dev secret (`COS_DEMO_TOTP_SECRET`),
// which is what makes a seeded environment usable for these roles at all. That is satisfying the
// realm's control rather than going around it: no exemption is added and no realm setting changes.
// Without the variable this script stops before the browser opens and says so, rather than
// photographing a login page.
//
// THE SAME IS TRUE OF `capture-android-tenant-admin-home.mjs`, whose header still says Path A works
// for TENANT_ADMIN "because provision-keycloak-demo.ts gives phone-holders a phone username". That
// was accurate before 2026-08-22 and is not now; it was verified false in the same session.
//
// IT ANSWERS THE PROJECT PICKER, and that is new for this role. `<SelectProjectSheet />` was mounted
// for FINANCE on 2026-09-08 — third role to join, after SITE_ENGINEER and SAFETY_OFFICER, and for
// the identical reason both of those did: two of the four screens are project-scoped
// (`GET /finance/cashflow-forecast/:projectId`, `GET /finance/budget/:projectId`), nothing but that
// sheet writes `projectStore`, so without it the Active Project bar rendered nothing and the Budget
// screen's permanent state was "select a project" with no way to select one. Writing this script is
// what surfaced it — the same way the other two were found.
//
// EIGHT FIGURES IN THESE FRAMES DID NOT COME FROM THE BACKEND, and that is a recorded decision
// rather than a broken capture. They are listed in ADR-099's 2026-09-08 amendment and live in one
// module, apps/mobile/src/lib/mockupFigures.ts: the "+12% vs last week" delta and the burn rate on
// Home; the payment detail's service period and its "verified subcontractor" chip; the budget's
// "Code: 02-100"; and on Invoices the ENTIRE 3-way-matching banner, every per-card match percentage
// and GRN reference, and the discrepancy sentence on a disputed card. THREE-WAY MATCHING DOES NOT
// EXIST IN backend/src — nothing reconciles a purchase order against a delivery against an invoice.
// The drawer's "Lead Controller" is drawn too; the employee id beside it is not.
//
// NO CONFIDENCE APPEARS ANYWHERE IN THESE FRAMES, and the drawings put one on four cards. Three of
// them read a DETERMINISTIC forecast, so a percentage would claim a model that never ran; the
// fourth, the matching banner, has no process behind it at all. Same carve-out ADR-098's second
// amendment and ADR-099 record: the card names the PROJECT its figures came from instead.
//
// Everything else in these frames is live data from the seeded tenant — the approval queue and its
// total, the cash-flow forecast and its risk grade, the budget and every category's allocation, the
// per-category spend summed from cost transactions, the invoice list and its filter counts, and
// every invoice's vendor, PO number, delivery state and amount-over-PO.
//
// Prerequisites, in order:
//   1. `make docker-up` PLUS `docker compose --profile full up -d keycloak` — no ClickHouse is
//      needed for this role (every figure here is Postgres), but Keycloak is a `full`-profile
//      service and the essential profile does not start it
//   2. `npx ts-node prisma/seed-realistic.ts` (from backend/) — the Postgres demo tenant
//   2a. `npx ts-node prisma/provision-keycloak-demo.ts` (from backend/) — the SAME users in
//       Keycloak. seed-realistic.ts writes Postgres only, and Path A's verify step exchanges the
//       OTP for a session through the identity provider, so without this the realm has no account
//       to grant and the backend answers COS-AUTH-503 — which the app shows as "Invalid or
//       expired OTP". Being reachable is not enough; the realm has to know the user.
//   3. backend on :3000 with E2E_AUTH_BYPASS=true
//   3a. KEYCLOAK RUNNING on :8090 — see the executive script for what its absence looks like from
//       the app (a valid OTP reported as invalid). NOTE:
//       `backend/src/workers/__tests__/main.spec.ts` binds 8090 itself, so run the unit suite with
//       Keycloak stopped and the capture with it started.
//   4. emulator booted with the debug APK installed
//   5. Metro started with EXPO_PUBLIC_CAPTURE=1 (mutes the dev LogBox toast, freezes animation loops)
// Run: node scripts/capture-android-finance.mjs
//      node scripts/capture-android-finance.mjs budget   ← re-shoot one screen only
// Targets: home · payments · payment-detail · budget · invoices · drawer · settings

import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../../docs/screens/android/09-finance');
const TMP = process.env['TEMP'] ?? process.env['TMP'] ?? HERE;
const STITCH = join(HERE, 'stitch-fullpage.py');
const PKG = 'com.constructionos.cos';

// Path B credentials. The password is the demo one `provision-keycloak-demo.ts` sets; the secret
// has no default on purpose — a wrong TOTP is indistinguishable from a wrong password on screen.
const OFFICE_USER = process.env['COS_CAPTURE_USER'] ?? '+66811000011';
const OFFICE_PW = process.env['COS_CAPTURE_PASSWORD'] ?? 'Ekachai@2026';
const TOTP_SECRET = process.env['COS_CAPTURE_TOTP_SECRET'] ?? '';

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

/** A node's exact rectangle, for handing a pinned control's bounds to the stitcher. */
async function boundsOf(pred, what) {
  const node = (await dump()).find((n) => pred(n) && n.includes('bounds='));
  if (!node) throw new Error(`capture: ${what} never appeared`);
  const m = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node);
  return [+m[1], +m[2], +m[3], +m[4]];
}

/** Is the node on screen at all? Distinct from `find`, which waits for it. */
async function present(pred) {
  return (await dump()).some((n) => pred(n) && n.includes('bounds='));
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
 * @param shots how many viewports to walk. 8 by default, which reaches the foot of every screen
 *              here except one.
 *
 *              A LIST OF NEAR-IDENTICAL ROWS IS WORTH STOPPING SHORT ON. The invoice queue is
 *              thirty cards that differ by a number: same status tag, same vendor, same Dispute
 *              button. At full length (5,670px) the stitcher had several equally good answers for
 *              where each shot overlapped the last and joined two of them wrong, printing one card
 *              over another. Shooting four viewports keeps the frame inside the range where the
 *              match is unambiguous, and a frame that shows eight identical cards says everything a
 *              frame showing thirty would (PO decision 2026-09-08).
 * @param step  how far one swipe drags, and with it the stitcher's `--max-scroll`. The two are
 *              one setting because the matcher's comparison window is `content_h - max_scroll`:
 *              a longer swipe needs a wider search, which leaves a shorter window to search WITH.
 *
 *              MAX_SCROLL MUST STAY BELOW THE PAGE'S ROW PITCH. That is the whole rule. The invoice
 *              cards stand about 900px apart, and at `--max-scroll 900` the matcher could slide a
 *              full card and still call it a match — which is what printed one invoice over another
 *              twice. Dropped to a 500px swipe and a 700px search, a whole-card slip is outside the
 *              range it can even consider.
 * @param fab   `[x0, y0, x1, y1]` for a control that is PINNED rather than scrolled, or null.
 *              Measured with `boundsOf` from the live dump rather than hardcoded: the stitcher
 *              erases exactly those pixels from every shot and redraws the control once, and a
 *              rectangle guessed a few pixels small leaves a crescent of it repeated down the page.
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
    const p = join(TMP, `fn_${name.replace(/[^a-z0-9]/gi, '_')}_${i}.png`);
    grab(p);
    frames.push(p);
    if (i < shots - 1) {
      // 600px, NOT 800. The stitcher matches each shot against the previous one by searching for
      // the overlap, and a page of near-identical cards — the budget breakdown, the invoice list —
      // gives it several equally good answers. A shorter swipe leaves more overlap to disambiguate
      // with, and 600 x 7 still covers the tallest page here (the 4,101px budget screen). It cost
      // two runs of the budget frame: both lost the "Category breakdown" heading into a seam, which
      // reads as a missing element rather than as a bad join.
      adb('shell', 'input', 'swipe', '540', '1700', '540', String(1700 - step.swipe), '500');
      await delay(1500);
    }
  }
  // `--fab` WHERE ONE IS PINNED. Unlike EXECUTIVE, which is read-only on mobile, three of this
  // role's screens float a control inside the scrolling band — the payment FAB, the budget
  // amendment FAB and the invoices scan bar — and a fixed element repeated down a stitched page is
  // what the stitcher's overlap search trips over. The caller passes its band; screens with no
  // floating control pass nothing and the argument is omitted.
  const extra = fab === null ? [] : ['--fab', fab.join(',')];
  // Matched to the 600px swipe above. The default 1400 leaves the stitcher a 596-row comparison
  // window, which is under two of this role's category cards — see the stitcher's own note.
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
 * RFC 6238 TOTP — SHA-1, 6 digits, 30-second step, which is this realm's OTP policy.
 *
 * THE SECRET IS USED AS RAW BYTES, NOT BASE32-DECODED, and that is Keycloak's model rather than a
 * shortcut. Keycloak stores an OTP credential's `secretData.value` as a plain string and signs with
 * `secret.getBytes()`; the base32 string it shows a user for manual entry is
 * `Base32.encode(secret.getBytes())`, one encoding further out. Decoding the stored value as base32
 * — the first thing this function did — produces a different key and Keycloak answers "Invalid
 * authenticator code", which reads like a clock-skew problem and is not one.
 *
 * Written out rather than pulled from a package: the capture scripts have no dependencies of their
 * own, and `node:crypto` already carries the only primitive this needs.
 */
function totpNow(secret) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const digest = createHmac('sha1', Buffer.from(secret, 'utf8')).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(code % 1_000_000).padStart(6, '0');
}

/**
 * Chrome's first-run pages, which cover the login before it can be typed into.
 *
 * MEASURED, NOT GUESSED. On this AVD the flow opens on "Make Chrome your own" with
 * `signin_fre_dismiss_button` ("Stay signed out"), and one tap clears it straight to the custom tab.
 * The other two ids are the pages a differently-configured Chrome shows instead; each is tapped only
 * if it is actually there, so the list costs one dump per entry and never taps something else.
 *
 * This is the same class of obstacle `dismissImeOnboarding` handles for Gboard, and it cost a run to
 * find: the failure reads "browser username field never appeared", which looks like a bad selector.
 */
async function dismissChromeOnboarding() {
  for (const id of [
    'com.android.chrome:id/signin_fre_dismiss_button',
    'com.android.chrome:id/ack_button',
    'com.android.chrome:id/negative_button',
  ]) {
    const node = (await dump()).find((n) => byId(id)(n) && hasRealBounds(n));
    if (!node) continue;
    const c = centreOf(node);
    adb('shell', 'input', 'tap', String(c.x), String(c.y));
    await delay(2500);
  }
}

/**
 * Type into a field of the web page Chrome is showing.
 *
 * CHROME PUBLISHES AN INPUT'S HTML `id` AS ITS `resource-id`, so the realm's own markup is what this
 * matches on — `username`, `password`, `kc-login`, `otp`. Matching on visible text was the first
 * draft and does not survive the realm's custom theme.
 *
 * ONLY THE FIRST FIELD OF A FORM IS EVER TAPPED. Everything after it is reached with TAB, and the
 * form is submitted with ENTER, because the moment the keyboard is up it covers the rest of the page:
 * the realm's password input sits at y≈1435-1575 on this AVD and the keyboard's top edge lands at
 * ≈1400, so a tap on that field's own reported centre hits the keyboard instead. The password was
 * then never typed and Keycloak answered "Invalid username or password", which reads like a wrong
 * credential rather than a missed tap — it cost a run to tell those apart.
 */
async function tapWeb(id, what) {
  const c = await find(byId(id), what, 40);
  adb('shell', 'input', 'tap', String(c.x), String(c.y));
  await delay(700);
}

/** Type into whatever currently has focus. `%s` is `input text`'s own escape for a space. */
async function typeFocused(text) {
  adb('shell', 'input', 'text', text.replace(/ /g, '%s'));
  await delay(500);
}

/**
 * Path B sign-in, end to end.
 *
 * WHY NOT PATH A. The realm denies direct grant where the `role` attribute matches
 * `^(TENANT_ADMIN|FINANCE)$` — ADR-067 as amended 2026-08-22, product-owner decision 2026-08-21.
 * Measured on 2026-09-08: `POST /auth/otp/verify` as +66811000011 answers 503 and the backend log
 * carries Keycloak's own reason, "This role must sign in with email and password."
 *
 * The OTP step is answered only IF the realm asks for it — the check is whether the field is there,
 * not an assumption, so this also works for a Path B role that carries no second factor.
 */
async function officeLogin() {
  if (TOTP_SECRET === '') {
    throw new Error(
      'capture: COS_CAPTURE_TOTP_SECRET is unset. This role signs in through Path B and the realm ' +
        'requires a second factor. `provision-keycloak-demo.ts` provisions one for every role in ' +
        'its MFA_ROLES set; export the secret it uses (COS_DEMO_TOTP_SECRET, default in that file).',
    );
  }
  console.log(`· Path B login as ${OFFICE_USER} (browser + PKCE)`);
  await tap(byId('office-login-button'), 'office login button');
  // Chrome has to start, get past its own onboarding, and render the realm's login page.
  await delay(7000);
  await dismissChromeOnboarding();

  await tapWeb('username', 'Keycloak username field');
  // Keycloak prefills the username when it re-renders after a failed attempt.
  adb('shell', 'input', 'keyevent', 'KEYCODE_MOVE_END');
  for (let i = 0; i < 40; i++) adb('shell', 'input', 'keyevent', 'KEYCODE_DEL');
  await typeFocused(OFFICE_USER);

  adb('shell', 'input', 'keyevent', 'KEYCODE_TAB');
  await delay(500);
  await typeFocused(OFFICE_PW);

  // ENTER submits the form. Tapping `kc-login` would be the same coordinate problem as the field
  // above — the button sits at y≈1582-1722, further under the keyboard than the input is.
  adb('shell', 'input', 'keyevent', 'KEYCODE_ENTER');
  await delay(5000);

  // ── The second factor ──────────────────────────────────────────────────────────────────────
  //
  // NOT FOUND BY DUMPING, and this is the trap that cost three runs. While the soft keyboard is
  // open `uiautomator dump` returns Chrome's toolbar and NOTHING of the web contents — no `otp`
  // node, no `kc-login`, nothing — so a poll for the field waits out its timeout on a page that is
  // plainly on screen. A device screenshot is what settled it. Dismissing the keyboard does not
  // help either: Keycloak's OTP form autofocuses its input, so the IME comes straight back.
  //
  // What IS reliable in that dump is the foreground PACKAGE. So the loop below asks the only
  // question it can answer — is the browser still up? — and types the code into the field Keycloak
  // has already focused. Blind, and correct for the same reason the page is usable by a person who
  // never taps: the cursor is in the one input on the page.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const nodes = await dump();
    if (nodes.some((n) => n.includes(`package="${PKG}"`))) break; // back in the app: done
    if (!nodes.some((n) => n.includes('package="com.android.chrome"'))) break;
    if (attempt === 0) console.log('· second factor requested — answering it');
    // Computed HERE, not before the wait: a code minted while the page was still loading can fall
    // outside its 30-second window by the time it is submitted.
    adb('shell', 'input', 'text', totpNow(TOTP_SECRET));
    await delay(600);
    adb('shell', 'input', 'keyevent', 'KEYCODE_ENTER');
    await delay(7000);
  }
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

  // ANIMATIONS OFF, OR NOTHING BELOW WORKS — see the executive script for the full account. These
  // are global device settings, not app state, and are restored to 1.0 at the end of a good run.
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

  await officeLogin();

  // WHICH PROJECT, BEFORE ANYTHING ELSE. The sheet is raised over Home for this role since
  // 2026-09-08 and owns the screen until it is answered, so waiting for `home-screen` first would
  // time out on an overlay rather than on a missing dashboard.
  await find(byId('select-project-screen'), 'project picker', 40);
  if (await present(byId('select-project-screen'))) {
    console.log('· choosing a project');
    // Each row is `select-project-{project_id}`; the first on screen is taken. The row's own
    // progress bar carries `select-project-progress-{id}`, so that prefix is excluded explicitly,
    // along with every non-row id the sheet mounts.
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

  // The destination, asserted rather than slept on — a mis-tap fails the run instead of being
  // photographed as if it were the dashboard.
  await find(byId('home-screen'), 'finance Home', 40);

  if (wanted('payments')) {
    console.log('· Payments tab (the approval queue)');
    await tap(byId('payments-tab'), 'Payments tab');
    await find(byId('payments-screen'), 'payments-screen', 20);
    // Three requests settle: the PENDING queue, the vendor-invoice index that names it, and the
    // forecast the analysis module reads. The index is what turns invoice UUIDs into vendor names,
    // so a short wait photographs a queue of em dashes.
    await delay(4500);
    // The raise-payment FAB floats inside the scrolling band, so it lands in every shot; the
    // stitcher erases it and draws it once.
    const fab = await boundsOf(byId('payments-add'), 'payments FAB');
    await stitchFull('02-Payments/01-fn-payment', undefined, fab);
  }

  if (wanted('payment-detail')) {
    console.log('· Payment detail (opened from the queue — NOT approved)');
    await tap(byId('payments-tab'), 'Payments tab');
    await find(byId('payments-screen'), 'payments-screen', 20);
    await delay(4000);
    // The first card in the queue, whatever its id. Its testID carries the payment's own uuid.
    const card = (await dump()).find(
      (n) => /resource-id="payment-item-[0-9a-f-]{8,}"/.test(n) && hasRealBounds(n),
    );
    if (!card) {
      console.log('  no pending payment in the seeded tenant — detail frame skipped');
    } else {
      const c = centreOf(card);
      adb('shell', 'input', 'tap', String(c.x), String(c.y));
      await find(byId('payment-detail'), 'payment-detail', 20);
      await delay(1200);
      // APPROVE IS NOT PRESSED. It is a real `PATCH /finance/payments/:id/approve` behind a
      // biometric prompt: pressing it would spend a demo payment on every run and leave the queue
      // one shorter than the last capture, and the emulator has no enrolled factor, so the prompt
      // would return `unavailable` and approve anyway. The frame is the screen, not the outcome.
      await stitchFull('02-Payments/02-fn-payment-detail');
      adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
      await delay(1000);
    }
  }

  if (wanted('budget')) {
    console.log('· Budget tab');
    await tap(byId('budget-tab'), 'Budget tab');
    await find(byId('budget-screen'), 'budget-screen', 20);
    // THE LONGEST WAIT ON THIS BAR, and it is paging rather than thinking: the per-category spend
    // walks `GET /finance/cost-transactions` to the end of the list — a page is at most 100 rows —
    // because a sum over page one is a sum over page one. A short wait photographs em dashes where
    // the category spend should be.
    await delay(7000);
    const fab = await boundsOf(byId('budget-amend'), 'budget FAB');
    await stitchFull('03-Budget/01-fn-budget', undefined, fab);
  }

  if (wanted('invoices')) {
    console.log('· Invoices tab');
    await tap(byId('invoices-tab'), 'Invoices tab');
    await find(byId('invoices-screen'), 'invoices-screen', 20);
    // Seven requests settle: the visible list, five `limit=1` counts (one per status, read for the
    // server's own total) and the purchase-order index that gives each card its PO number, its
    // delivery state and its amount-over-PO. The chips photograph without numbers if this is short.
    await delay(5000);
    // The scan bar is pinned to the foot of this screen rather than scrolled with the list, so it
    // is the same problem a FAB is and takes the same treatment.
    const scan = await boundsOf(byId('invoice-scan'), 'invoice scan bar');
    // THE SCAN BAR IS NOT A FLOATING BUTTON, so it is not passed as one. It is a sibling BELOW the
    // list, and the ~30px between it and the nav is the container's own padding — static page
    // background in every shot. `--fab` assumes the opposite: that real content scrolls behind the
    // control and can be recovered from a later shot. Repairing under a docked footer inserts rows
    // that were never behind it, and the 30px of padding underneath is never repaired at all, so
    // the feather cross-faded plain background over a card title and printed a grey band through
    // "INV-R9CT-CONC...".
    //
    // Ending the band at the bar's own top edge is what the bar actually is: pinned chrome, kept
    // once from the last shot together with the nav below it. No repair, no invented rows.
    //
    // FOUR viewports, not eight, and a shorter step. Thirty cards whose STATUS repeats do not need
    // photographing to the end (PO decision 2026-09-08), and the 500/700 pair keeps the stitcher's
    // search below the ~900px card pitch so it cannot slide a whole card — see `stitchFull`.
    await stitchFull('04-Invoices/01-fn-invoice', { top: TOP, bottom: scan[1] }, null, 4, {
      swipe: 500,
      maxScroll: 700,
    });
  }

  // HOME IS SHOT LAST, for the reason the executive, project-manager and safety-officer scripts all
  // document: a dashboard photographed seconds after sign-in can catch its own load losing a race
  // with the session. This screen refetches on focus, so returning to the tab at the end
  // photographs settled data.
  if (wanted('home')) {
    console.log('· Home tab (last — see the note above)');
    await tap(byId('home-tab'), 'Home tab');
    await find(byId('home-screen'), 'finance Home', 20);
    await delay(6000);
    await stitchFull('01-Home/01-fn-dashboard');
  }

  // THE DRAWER IS NOT A TAB — `05_profile/01_fn_navigation_drawer` is the overlay every role opens
  // from the TopBar. Shot after Home because it is opened FROM a tab and closing it returns to
  // whatever was underneath.
  if (wanted('drawer')) {
    console.log('· Navigation drawer (overlay, opened from the TopBar)');
    await tap(byId('home-tab'), 'Home tab');
    await find(byId('home-screen'), 'finance Home', 20);
    await tap(byId('drawer-menu-button'), 'drawer menu button');
    await find(byId('navigation-drawer'), 'navigation drawer', 20);
    // The profile zone's employee code and MFA line come from `GET /users/me`, requested when the
    // drawer first opens rather than on mount. A short wait photographs the UUID fallback.
    await delay(2500);
    // The overlay covers the TopBar and the bottom nav, so the page band would crop its own header
    // and its logout row. 96 clears the status bar; 2400 is the foot of the screen.
    await stitchFull('05-Drawer/01-fn-navigation-drawer', { top: 96, bottom: 2400 });
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
    // row below, which at the foot of this list is LOGOUT. See that helper for what that cost.
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
    // The notification section reads its preferences from the server.
    await delay(2500);
    await stitchFull('05-Drawer/02-fn-account-settings');
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
