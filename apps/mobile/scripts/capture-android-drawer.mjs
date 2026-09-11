// Android Navigation Drawer capture — EVERY ROLE, one frame each.
//
// Produces, under docs/screens/android/02-shared/03-navigation-drawer/:
//   01-site-engineer · 02-site-worker · 03-safety-officer · 04-project-manager · 05-executive
//   06-proc-officer · 07-proc-manager · 08-crm-manager · 09-viewer · 10-finance · 11-tenant-admin
//
// Drawing: mockup/mobile/03_site_engineer/05_profile/01_se_navigation_drawer, redrawn by Stitch as
// "Navigation Drawer - Construction OS Mobile" and named by the product owner on 2026-09-11 as the
// shell EVERY role shares. That is why this script exists and why it loops: the claim under test is
// "ทุก role ต้องมีโครงสร้างหลักเหมือนกัน", and a claim about twelve roles cannot be shown by
// photographing one.
//
// ── WHY `02-shared/`, AND WHY NOT A ROLE FOLDER ────────────────────────────────────────────────
//
// `02-shared/` is defined in docs/screens/android/README.md as "cross-role screens that belong to no
// role". The drawer is the same panel for all of them — the SHELL is the subject here and the rows
// are what differ, so filing eleven copies under eleven role folders would scatter one subject.
//
// ── TWO LOGIN LEGS, AND THE SECOND IS NOT OPTIONAL ─────────────────────────────────────────────
//
// Nine roles sign in through PATH A (phone + OTP). FINANCE and TENANT_ADMIN CANNOT: the realm denies
// direct grant where the `role` attribute matches `^(TENANT_ADMIN|FINANCE)$` (ADR-067 as amended
// 2026-08-22, product-owner decision 2026-08-21), and `POST /auth/otp/verify` answers 503 with
// Keycloak's own reason — "This role must sign in with email and password". Measured 2026-09-08 by
// `capture-android-finance.mjs`, whose Path B leg this script ports rather than reinvents.
//
// Path B needs `COS_CAPTURE_TOTP_SECRET`. `provision-keycloak-demo.ts` gives every role in its
// `MFA_ROLES` set a TOTP credential with a fixed dev secret; export the one it uses. Without it this
// script captures the nine and says plainly which two it skipped, rather than photographing a login
// page and calling it a drawer.
//
// ── SYSTEM_ADMIN IS NOT HERE, AND CANNOT BE ────────────────────────────────────────────────────
//
// It has no seeded demo user — `backend/prisma/seed-realistic.ts` covers eleven of the twelve roles
// — and it would have nothing to show: `drawerLinksFor(SYSTEM_ADMIN)` is 0 rows, because §20.7.11
// puts that role in the separate `/admin` panel rather than the tenant-scoped mobile app. "Every
// role" means every role that has a drawer.
//
// ONE VIEWPORT EACH, no stitching. The fold caps a role's own section at six rows plus `More`, so
// even TENANT_ADMIN's 19-row menu draws inside one screen — which is the point of the fold.
//
// Prerequisites: docker compose up (with the `full` profile) + backend on :3000 + seeded demo data,
// emulator booted with the debug APK, Metro started with EXPO_PUBLIC_CAPTURE=1.
// Run: node scripts/capture-android-drawer.mjs [role-key …]

import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../../docs/screens/android/02-shared/03-navigation-drawer');
const TMP = process.env['TEMP'] ?? process.env['TMP'] ?? HERE;
const STITCH = join(HERE, 'stitch-fullpage.py');
const PKG = 'com.constructionos.cos';

const OTP_CODE = process.env['E2E_TEST_OTP'] ?? '123456';
const OFFICE_PW = process.env['COS_CAPTURE_PASSWORD'] ?? 'Ekachai@2026';
const TOTP_SECRET = process.env['COS_CAPTURE_TOTP_SECRET'] ?? '';

/**
 * Every role that has a drawer, with the seeded account that reaches it.
 *
 * `path` is not a preference — see the header. The order is the order they are captured in, chosen
 * so the two Path B roles come last: they are the only ones that can be skipped, and a run that
 * stops there has already produced the other nine.
 */
const ROLES = [
  { key: 'site-engineer', out: '01-site-engineer', phone: '0811000009', path: 'A' },
  { key: 'site-worker', out: '02-site-worker', phone: '0811000010', path: 'A' },
  { key: 'safety-officer', out: '03-safety-officer', phone: '0811000007', path: 'A' },
  { key: 'project-manager', out: '04-project-manager', phone: '0811000003', path: 'A' },
  { key: 'executive', out: '05-executive', phone: '0811000001', path: 'A' },
  { key: 'proc-officer', out: '06-proc-officer', phone: '0811000005', path: 'A' },
  { key: 'proc-manager', out: '07-proc-manager', phone: '0811000006', path: 'A' },
  { key: 'crm-manager', out: '08-crm-manager', phone: '0811000012', path: 'A' },
  { key: 'viewer', out: '09-viewer', phone: '0811000013', path: 'A' },
  { key: 'finance', out: '10-finance', phone: '+66811000011', path: 'B' },
  { key: 'tenant-admin', out: '11-tenant-admin', phone: '+66811000002', path: 'B' },
];

// Fixed bands on the Medium_Phone AVD (1080×2400), the values every sibling script documents. The
// drawer is an OVERLAY drawn above the bottom nav (its `overlay` style lifts it with elevation 32),
// so the band runs to the bottom of the viewport rather than stopping at the tab bar.
const TOP = 200;
const BOT = 2400;

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

function hasRealBounds(node) {
  const m = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node);
  if (!m) return false;
  return Number(m[3]) > Number(m[1]) && Number(m[4]) > Number(m[2]);
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

async function textOf(pred) {
  const node = (await dump()).find((n) => pred(n) && n.includes('bounds='));
  if (!node) return null;
  return /\stext="([^"]*)"/.exec(node)?.[1] ?? '';
}

/** Tap a field, type into it, and CHECK THAT THE TEXT ARRIVED — the IME can drop a keystroke. */
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

/** One frame, cropped to the standard band — the drawer is one viewport by design. */
async function shootOne(name) {
  const dest = join(OUT, `${name}.png`);
  mkdirSync(dirname(dest), { recursive: true });
  const frame = join(TMP, `dr_${name.replace(/[^a-z0-9]/gi, '_')}.png`);
  grab(frame);
  process.stdout.write(
    execFileSync('python', [STITCH, dest, String(TOP), String(BOT), frame], { encoding: 'utf-8' }),
  );
  console.log(`  shot ${name}.png`);
}

/**
 * RFC 6238 TOTP — SHA-1, 6 digits, 30-second step, this realm's OTP policy.
 *
 * THE SECRET IS USED AS RAW BYTES, NOT BASE32-DECODED. Keycloak stores an OTP credential's
 * `secretData.value` as a plain string and signs with `secret.getBytes()`; base32-decoding it
 * produces a different key and the realm answers "Invalid authenticator code", which reads like
 * clock skew and is not. Ported verbatim from capture-android-finance.mjs, where that cost a run.
 */
function totpNow(secret) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const digest = createHmac('sha1', Buffer.from(secret, 'utf8')).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(code % 1_000_000).padStart(6, '0');
}

/** Chrome's first-run pages, which cover the login before it can be typed into. */
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

/** Type into whatever currently has focus. `%s` is `input text`'s own escape for a space. */
async function typeFocused(text) {
  adb('shell', 'input', 'text', text.replace(/ /g, '%s'));
  await delay(500);
}

/**
 * Type into a field of the web page Chrome is showing.
 *
 * Chrome publishes an input's HTML `id` as its `resource-id`, so the realm's own markup is what this
 * matches on. ONLY THE FIRST FIELD IS TAPPED — everything after it is reached with TAB, because the
 * keyboard covers the rest of the page once it is up.
 */
async function tapWeb(id, what) {
  const c = await find(byId(id), what, 40);
  adb('shell', 'input', 'tap', String(c.x), String(c.y));
  await delay(700);
}

/**
 * Path A — phone + OTP. Nine of the eleven roles.
 *
 * IT WAITS OUT THE RESEND COOLDOWN, because this script can trip it in a way a single-screen script
 * never does. `POST /auth/otp/request` answers `{"expiresInSeconds":300,"resendCooldownSeconds":60}`
 * — measured — and a second request for the same number inside that minute is refused, so the OTP
 * step never renders and the run dies with "OTP input never appeared", which reads like a broken
 * selector. It is not: re-running one role straight after a previous run of THAT role is enough to
 * cause it. The loop spaces different roles far enough apart on its own; this covers the re-run.
 */
async function loginPathA(phone) {
  console.log(`  · Path A login as ${phone}`);
  await typeInto(byId('phone-input'), phone, 'phone input');
  await hideKeyboard();
  await tap(byId('request-otp-button'), 'request OTP button');
  if (!(await present(byId('otp-input')))) {
    // 12 polls ≈ 12s before deciding it is the cooldown rather than a slow request.
    let seen = false;
    for (let i = 0; i < 12 && !seen; i++) {
      await delay(1000);
      seen = await present(byId('otp-input'));
    }
    if (!seen) {
      console.log('  · no OTP step — waiting out the 60s resend cooldown, then asking again');
      await delay(62_000);
      await tap(byId('request-otp-button'), 'request OTP button (after cooldown)');
    }
  }
  await find(byId('otp-input'), 'OTP input');
  await typeInto(byId('otp-input'), OTP_CODE, 'OTP input');
  await hideKeyboard();
  await tap(byId('verify-otp-button'), 'verify OTP button');
}

/** Path B — Keycloak in a custom tab, with the second factor the realm demands. */
async function loginPathB(username) {
  console.log(`  · Path B login as ${username} (browser + PKCE)`);
  await tap(byId('office-login-button'), 'office login button');
  await delay(7000);
  await dismissChromeOnboarding();

  await tapWeb('username', 'Keycloak username field');
  adb('shell', 'input', 'keyevent', 'KEYCODE_MOVE_END');
  for (let i = 0; i < 40; i++) adb('shell', 'input', 'keyevent', 'KEYCODE_DEL');
  await typeFocused(username);

  adb('shell', 'input', 'keyevent', 'KEYCODE_TAB');
  await delay(500);
  await typeFocused(OFFICE_PW);
  adb('shell', 'input', 'keyevent', 'KEYCODE_ENTER');
  await delay(5000);

  // The second factor is answered BLIND and deliberately: while the soft keyboard is open a dump
  // returns Chrome's toolbar and nothing of the web contents, so polling for the `otp` field waits
  // out its timeout on a page that is plainly on screen. The foreground PACKAGE is the one thing the
  // dump can still answer, and Keycloak autofocuses its single input.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const nodes = await dump();
    if (nodes.some((n) => n.includes(`package="${PKG}"`))) break;
    if (!nodes.some((n) => n.includes('package="com.android.chrome"'))) break;
    if (attempt === 0) console.log('    · second factor requested — answering it');
    // Computed HERE rather than before the wait: a code minted while the page was loading can fall
    // outside its 30-second window by the time it is submitted.
    adb('shell', 'input', 'text', totpNow(TOTP_SECRET));
    await delay(600);
    adb('shell', 'input', 'keyevent', 'KEYCODE_ENTER');
    await delay(7000);
  }
}

const ONLY = new Set(process.argv.slice(2));
const wanted = (key) => ONLY.size === 0 || ONLY.has(key);
const METRO_PORT = process.env['METRO_PORT'] ?? '8081';

async function captureRole(role) {
  console.log(`\n· ${role.key}`);
  adb('shell', 'am', 'force-stop', PKG);
  adb('shell', 'pm', 'clear', PKG);
  adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
  // 30s, matching every proven sibling. This script `pm clear`s before each role, so EVERY launch
  // here is a cold one — 24s was not enough and the run failed on the first role with "drawer button
  // never appeared", which reads like a wrong id and was a bundle still loading.
  console.log('  · waiting for the JS bundle');
  await delay(30_000);

  if (role.path === 'A') await loginPathA(role.phone);
  else await loginPathB(role.phone);

  // The shell, not the role's home: `home-screen` is on nine home variants but not
  // SiteEngineerHome, and `drawer-menu-button` is on every (app) screen for every role.
  await find(byId('drawer-menu-button'), 'signed-in shell', 40).catch(() => undefined);
  console.log('  · signed in');

  // The project picker, where this role is given one. It sits OVER the shell, so the drawer cannot
  // be opened until it is answered.
  if (await present(byId('select-project-screen'))) {
    console.log('  · choosing a project');
    // A FAILED LIST IS RETRIED, not reported as a missing drawer. The sheet's own retry button
    // exists for exactly this (see SelectProjectSheet.tsx, 2026-08-12) and the run of 2026-09-11
    // died on `safety-officer` with "drawer button never appeared" — which was the picker still on
    // screen holding "Your sites could not be loaded" over the shell. The same account's
    // `GET /projects` answered 200 with eight projects from the shell a minute later, so the
    // failure is transient and one press of the control the screen already offers clears it.
    for (
      let attempt = 0;
      attempt < 3 && (await present(byId('select-project-failed')));
      attempt++
    ) {
      console.log('  · the project list failed — pressing its retry');
      await tap(byId('select-project-retry'), 'project-list retry');
      await delay(4000);
    }
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

  await tap(byId('drawer-menu-button'), 'drawer button');
  await find(byId('navigation-drawer'), 'navigation drawer', 30);

  // WAIT FOR THE POSITION LINE, DO NOT COUNT ON THE SLEEP. The panel slides in immediately and
  // `GET /users/me` fills `drawer-job-title` under the name whenever it lands, so a fixed 3 s was a
  // BET on that request — and on 2026-09-11 it lost for `viewer`: the frame came out with no
  // position line at all, while the same account's `/users/me` answered 200 with
  // "Client Representative" a minute later from the shell. Every seeded role has a position
  // (`positionFor` in backend/prisma/seed-realistic.ts covers all eleven), so its absence is always
  // a race and never the truth about the account.
  const titled = await find(byId('drawer-job-title'), 'profile position line', 20)
    .then(() => true)
    .catch(() => false);
  if (!titled) {
    console.log('  ! no position line after 20 s — shooting anyway, the frame will show the gap');
  }
  // The slide is 260 ms; the rest is for the rows to settle before the shutter.
  await delay(3000);
  await shootOne(role.out);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  adb('reverse', 'tcp:8081', `tcp:${METRO_PORT}`);
  for (const p of ['tcp:3000', 'tcp:8090']) adb('reverse', p, p);

  const todo = ROLES.filter((r) => wanted(r.key));
  const skipped = [];
  for (const role of todo) {
    if (role.path === 'B' && TOTP_SECRET === '') {
      skipped.push(role.key);
      continue;
    }
    await captureRole(role);
  }

  if (skipped.length > 0) {
    console.log(
      `\n! SKIPPED ${skipped.join(', ')} — COS_CAPTURE_TOTP_SECRET is unset. These roles sign in ` +
        'through Path B because the realm denies them direct grant (ADR-067), and the realm asks ' +
        'for a second factor. Export the secret provision-keycloak-demo.ts uses and re-run those ' +
        'two keys.',
    );
  }
  console.log(`\nDone → ${OUT}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
