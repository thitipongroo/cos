// Android capture — ACCOUNT SETTINGS and PROFILE, one pair per role, into each role's own folder.
//
// Produces, for every role that has a drawer:
//   <role>/05-Drawer/02-<prefix>-account-settings.png
//   <role>/05-Drawer/03-<prefix>-profile.png
// (`06-Drawer` for proc-manager — its five tabs already occupy 01–05, so its drawer is the sixth in
// flow order. The folder NAME is unified; the number is position, and renumbering a tab to free
// `05` would be renumbering a tab to suit something that is not one.)
//
// ── WHY PER ROLE, WHEN ONE COMPONENT SERVES ALL TWELVE ────────────────────────────────────────
//
// These two screens ARE the same screen for every role — one `<AccountSettings />`, one `/profile`.
// They lived in `02-shared/` for that reason until 2026-09-13, when the product owner moved them
// into the role folders so each role's set is complete in one place. What differs between the
// frames is real but narrow: the notification section offers the §19.4 types routed to the
// signed-in role, the profile block carries that person's name, position and id, and the Password
// row appears only where the account has an email. Everything else is identical by construction,
// and that is worth being able to see side by side.
//
// ── ELEVEN, NOT TWELVE ────────────────────────────────────────────────────────────────────────
//
// `SYSTEM_ADMIN` is cross-tenant and provisioned to no tenant (§6.7), so no demo account signs in
// as it — `seed-realistic.ts` covers eleven of the twelve. §20.7.11 puts that role in the separate
// `/admin` panel rather than this app. Eleven is every role that has a drawer to reach these
// screens from.
//
// ── TWO LOGIN LEGS, AND THE SECOND IS NOT OPTIONAL ────────────────────────────────────────────
//
// Nine roles sign in through PATH A (phone + OTP). FINANCE and TENANT_ADMIN CANNOT: the realm
// denies direct grant where the `role` attribute matches `^(TENANT_ADMIN|FINANCE)$` (ADR-067 as
// amended 2026-08-22), so they go through the Keycloak browser with a computed TOTP. Both legs are
// ported from `capture-android-drawer.mjs` rather than reinvented — including the detail that cost
// that script a run, that the OTP secret is used as RAW BYTES and not base32-decoded.
//
// Without `COS_CAPTURE_TOTP_SECRET` those two are SKIPPED BY NAME. A capture run must never
// photograph a login page and file it as a settings screen.
//
// ── ONE FRAME EACH, BY SHRINKING THE SCREEN ───────────────────────────────────────────────────
//
// Account Settings is far longer than a viewport. Rather than stitching scrolled shots, the display
// density is lowered so the whole page lands in one frame — the method
// `capture-android-site-engineer-tabs.mjs` adopted after four attempts at swiping produced three
// filed "full pages" with most of the content missing. The two screens take DIFFERENT values
// because they are different lengths: settings at 200, profile at 300. Measured 2026-09-13 — at the
// device's own 420 the profile's USER ID row falls below the fold, and at 200 the same page fits
// with half the frame left empty. The density is ALWAYS restored, including when a run dies.
//
// Prerequisites: docker compose --profile full up -d · backend on :3000 · seed-realistic +
// provision-keycloak-demo · emulator booted with a debug APK BUILT ON OR AFTER 2026-09-13
// (`/profile` imports expo-image-picker, whose JS calls `requireNativeModule` at module scope — an
// older APK does not carry it and the screen throws on import) · Metro with EXPO_PUBLIC_CAPTURE=1.
// Run: node scripts/capture-android-role-profile.mjs [role-key …]

import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCREENS = resolve(HERE, '../../../docs/screens/android');
const PKG = 'com.constructionos.cos';

const OTP_CODE = process.env['E2E_TEST_OTP'] ?? '123456';
const OFFICE_PW = process.env['COS_CAPTURE_PASSWORD'] ?? 'Ekachai@2026';
const TOTP_SECRET = process.env['COS_CAPTURE_TOTP_SECRET'] ?? '';

/**
 * Every role that has a drawer, with the seeded account that reaches it and where its frames go.
 *
 * `dir` and `prefix` are read off the committed tree rather than derived: nine roles already fixed
 * their own prefix in their own file names (`01-se-home-dashboard.png` and so on), and crm-manager
 * and viewer name files by content, which is a prefix in effect. Inventing two-letter codes for
 * those two would have made the set less consistent, not more.
 *
 * `path` is not a preference — see the header. The order puts the two Path B roles last: they are
 * the only ones that can be skipped, and a run that stops there has already produced the other nine.
 */
const ROLES = [
  {
    key: 'site-engineer',
    dir: '03-site-engineer/05-Drawer',
    prefix: 'se',
    phone: '0811000009',
    path: 'A',
  },
  {
    key: 'site-worker',
    dir: '05-site-worker/05-Drawer',
    prefix: 'sw',
    phone: '0811000010',
    path: 'A',
  },
  {
    key: 'safety-officer',
    dir: '07-safety-officer/05-Drawer',
    prefix: 'sa',
    phone: '0811000007',
    path: 'A',
  },
  {
    key: 'project-manager',
    dir: '06-project-manager/05-Drawer',
    prefix: 'pm',
    phone: '0811000003',
    path: 'A',
  },
  { key: 'executive', dir: '08-executive/05-Drawer', prefix: 'ex', phone: '0811000001', path: 'A' },
  {
    key: 'proc-officer',
    dir: '10-proc-officer/05-Drawer',
    prefix: 'po',
    phone: '0811000005',
    path: 'A',
  },
  {
    key: 'proc-manager',
    dir: '11-proc-manager/06-Drawer',
    prefix: 'pom',
    phone: '0811000006',
    path: 'A',
  },
  {
    key: 'crm-manager',
    dir: '12-crm-manager/05-Drawer',
    prefix: 'crm',
    phone: '0811000012',
    path: 'A',
  },
  { key: 'viewer', dir: '13-viewer/05-Drawer', prefix: 'viewer', phone: '0811000013', path: 'A' },
  { key: 'finance', dir: '09-finance/05-Drawer', prefix: 'fn', phone: '+66811000011', path: 'B' },
  {
    key: 'tenant-admin',
    dir: '04-tenant-admin/05-Drawer',
    prefix: 'ta',
    phone: '+66811000002',
    path: 'B',
  },
];

const DENSITY = { settings: '200', profile: '300' };

/**
 * Roles whose Account Settings page does not fit at 200, with the value that does.
 *
 * MEASURED 2026-09-13, not guessed: the first eleven-role run filed two frames whose SYSTEM group
 * ran past the bottom nav — the `Version` row, the last thing on the page, was simply absent. Both
 * are longer pages for a reason the screen itself shows. PROJECT_MANAGER carries the most §19.4
 * notification types of any role, so its Notification Types section is the tallest; VIEWER is the
 * one role that gets the System Permissions block, which adds a whole group.
 *
 * A truncated page filed as a full page is the exact failure lowering the density exists to
 * prevent, and it is invisible unless someone looks for the last row — which is why the check after
 * a run is "is `Version` in the frame", not "does the frame look right".
 *
 * The other nine stay at 200 rather than all eleven dropping to 180: these frames are meant to be
 * read side by side, and 10 % is a difference a reader will not notice where a missing row is one
 * they cannot recover.
 */
const SETTINGS_DENSITY = { 'project-manager': '180', viewer: '180' };

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
  return m ? Number(m[3]) > Number(m[1]) && Number(m[4]) > Number(m[2]) : false;
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
    console.log(`    · ${what}: typed "${text}", field reads "${got ?? 'gone'}" — retrying`);
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
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, png);
}

/** Lower the density so a long page fits one frame. ALWAYS restored, including on a throw. */
async function withShrunkScreen(density, fn) {
  adb('shell', 'wm', 'density', density);
  await delay(4000); // the app re-lays out on a density change; RN needs a moment
  try {
    await fn();
  } finally {
    adb('shell', 'wm', 'density', 'reset');
    await delay(3000);
  }
}

/** Expo's dev-build banners sit over the top of the page and are not part of the app. */
async function dismissDevBanners() {
  for (const label of ['Dismiss', 'dismiss', 'Reload']) {
    const node = (await dump()).find(
      (n) => n.includes(`text="${label}"`) && n.includes('bounds=') && !n.includes(`${PKG}:id`),
    );
    if (!node) continue;
    const c = centreOf(node);
    adb('shell', 'input', 'tap', String(c.x), String(c.y));
    await delay(1500);
    return;
  }
}

/**
 * RFC 6238 TOTP — SHA-1, 6 digits, 30-second step, this realm's OTP policy.
 *
 * THE SECRET IS USED AS RAW BYTES, NOT BASE32-DECODED. Keycloak stores an OTP credential's
 * `secretData.value` as a plain string and signs with `secret.getBytes()`; base32-decoding it
 * produces a different key and the realm answers "Invalid authenticator code", which reads like
 * clock skew and is not. Ported verbatim from capture-android-drawer.mjs, where that cost a run.
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

async function tapWeb(id, what) {
  const c = await find(byId(id), what, 40);
  adb('shell', 'input', 'tap', String(c.x), String(c.y));
  await delay(700);
}

/**
 * Path A — phone + OTP. Nine of the eleven roles.
 *
 * IT WAITS OUT THE RESEND COOLDOWN. `POST /auth/otp/request` answers
 * `{"expiresInSeconds":300,"resendCooldownSeconds":60}`, and a second request for the same number
 * inside that minute is refused, so the OTP step never renders and the run dies with "OTP input
 * never appeared" — which reads like a broken selector and is not.
 */
async function loginPathA(phone) {
  console.log(`  · Path A login as ${phone}`);
  await typeInto(byId('phone-input'), phone, 'phone input');
  await hideKeyboard();
  await tap(byId('request-otp-button'), 'request OTP button');
  if (!(await present(byId('otp-input')))) {
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

/** Answer the project picker if this role is given one — it sits OVER the shell. */
async function answerProjectPicker() {
  if (!(await present(byId('select-project-screen')))) return;
  console.log('  · choosing a project');
  // A FAILED LIST IS RETRIED, not reported as a missing drawer. The sheet's own retry exists for
  // exactly this, and the failure is transient — the same account's `GET /projects` answers 200
  // from the shell a minute later.
  for (let attempt = 0; attempt < 4 && (await present(byId('select-project-failed'))); attempt++) {
    console.log('    · the project list failed — pressing its retry');
    await tap(byId('select-project-retry'), 'project-list retry');
    await delay(5000);
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

async function captureRole(role) {
  console.log(`\n· ${role.key}`);
  adb('shell', 'am', 'force-stop', PKG);
  adb('shell', 'pm', 'clear', PKG);
  adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
  // 30s: `pm clear` before each role makes EVERY launch here a cold one, and 24s was not enough.
  console.log('  · waiting for the JS bundle');
  await delay(30_000);
  await dismissDevBanners();

  if (role.path === 'A') await loginPathA(role.phone);
  else await loginPathB(role.phone);

  // `.catch`, NOT a bare await — the project picker sits OVER the shell for the roles that get one,
  // so `drawer-menu-button` is genuinely absent until it is answered.
  await find(byId('drawer-menu-button'), 'signed-in shell', 40).catch(() => undefined);
  await answerProjectPicker();
  await find(byId('drawer-menu-button'), 'signed-in shell (picker answered)', 40);
  console.log('  · signed in');

  // ── ACCOUNT SETTINGS ────────────────────────────────────────────────────────────────────────
  await tap(byId('drawer-menu-button'), 'drawer button');
  await find(byId('navigation-drawer'), 'navigation drawer', 30);
  await tap((n) => n.includes('resource-id="drawer-link-/account-settings"'), 'Settings row');
  await find(byId('account-settings'), 'account settings screen', 40);
  // The screen fetches /users/me (the head, the MFA row, the Password row's path) and
  // <NotificationSettings /> fetches its preferences. Give both a moment so the frame shows the
  // loaded page rather than a skeleton and a silent MFA row.
  await delay(9000);
  await dismissDevBanners();
  await withShrunkScreen(SETTINGS_DENSITY[role.key] ?? DENSITY.settings, async () => {
    await find(byId('account-settings'), 'account settings at capture density', 30);
    await delay(3000);
    grab(join(SCREENS, role.dir, `02-${role.prefix}-account-settings.png`));
    console.log(`  shot ${role.dir}/02-${role.prefix}-account-settings.png`);
  });

  // ── PROFILE ─────────────────────────────────────────────────────────────────────────────────
  // Entered from the DRAWER's profile card, which is its only entry point — the same path a user
  // takes, so the frame documents the route as well as the screen.
  await tap(byId('drawer-menu-button'), 'drawer button');
  await find(byId('navigation-drawer'), 'navigation drawer', 30);
  await tap(byId('drawer-profile-card'), 'drawer profile card');
  await find(byId('profile-screen'), 'profile screen', 40);
  await delay(7000);
  await dismissDevBanners();
  await withShrunkScreen(DENSITY.profile, async () => {
    await find(byId('profile-screen'), 'profile at capture density', 30);
    await delay(3000);
    grab(join(SCREENS, role.dir, `03-${role.prefix}-profile.png`));
    console.log(`  shot ${role.dir}/03-${role.prefix}-profile.png`);
  });
}

const ONLY = new Set(process.argv.slice(2));
const wanted = (key) => ONLY.size === 0 || ONLY.has(key);
const METRO_PORT = process.env['METRO_PORT'] ?? '8081';

async function main() {
  adb('reverse', 'tcp:8081', `tcp:${METRO_PORT}`);
  for (const p of ['tcp:3000', 'tcp:8090']) adb('reverse', p, p);

  const todo = ROLES.filter((r) => wanted(r.key));
  const skipped = [];
  const failed = [];
  for (const role of todo) {
    if (role.path === 'B' && TOTP_SECRET === '') {
      skipped.push(role.key);
      continue;
    }
    try {
      await captureRole(role);
    } catch (err) {
      // ONE ROLE'S FAILURE DOES NOT END THE RUN. Eleven roles at several minutes each is a long
      // wall-clock, and losing the nine that worked because the tenth hit a transient is the wrong
      // trade. Every failure is named again at the end so none is lost in the scroll.
      failed.push(`${role.key}: ${err.message ?? err}`);
      console.log(`  ! ${role.key} FAILED — ${err.message ?? err}`);
      try {
        adb('shell', 'wm', 'density', 'reset');
      } catch {
        /* the emulator is gone; nothing to restore */
      }
    }
  }

  if (skipped.length > 0) {
    console.log(
      `\n! SKIPPED ${skipped.join(', ')} — COS_CAPTURE_TOTP_SECRET is unset. These roles sign in ` +
        'through Path B because the realm denies them direct grant (ADR-067), and the realm asks ' +
        'for a second factor. Export the secret provision-keycloak-demo.ts uses and re-run those ' +
        'two keys.',
    );
  }
  if (failed.length > 0) {
    console.log(`\n! FAILED (${failed.length}):`);
    for (const f of failed) console.log(`    ${f}`);
    process.exitCode = 1;
  }
  console.log(`\nDone → ${SCREENS}`);
}

main().catch((err) => {
  try {
    adb('shell', 'wm', 'density', 'reset');
  } catch {
    /* the emulator is gone; nothing to restore */
  }
  console.error(err.message ?? err);
  process.exit(1);
});
