// Android capture — the two Stitch screens implemented on 2026-09-13, for the SITE_ENGINEER.
//
// Produces, under docs/screens/android/02-shared/:
//   04-account-settings/01-site-engineer.png   — Application Settings · Notification Settings ·
//                                                 Security & Access · System, one full page
//   05-profile/01-site-engineer.png            — the read-only profile record
//
// ── WHY `02-shared/`, NOT A ROLE FOLDER ───────────────────────────────────────────────────────
//
// `02-shared/` is defined in docs/screens/android/README.md as "cross-role screens that belong to
// no role", and both of these are exactly that: one <AccountSettings /> serves all twelve roles and
// so does `/profile`. They are shot as SITE_ENGINEER because that is the role the Stitch drawings
// are drawn for and the role whose seeded account reaches both by Path A — not because either
// screen differs by role. The only part that does differ is the notification section, which offers
// the §19.4 types routed to the signed-in role.
//
// ── ONE FRAME EACH, BY SHRINKING THE SCREEN ───────────────────────────────────────────────────
//
// Account Settings is far longer than a viewport. Rather than stitching scrolled shots, the display
// density is lowered so the whole page lands in one frame — the method
// `capture-android-site-engineer-tabs.mjs` adopted after four attempts at swiping produced three
// filed "full pages" with most of the content missing. The pixels are the app's real output at a
// real density (a phone set to a smaller display size shows exactly this), and the density is
// ALWAYS restored in a `finally`.
//
// ── WHAT THESE FRAMES ARE EVIDENCE OF ─────────────────────────────────────────────────────────
//
// Both drawings were followed for STYLE and departed from in COMPOSITION where the code could not
// honestly do what they draw (ADR-085). The departures are meant to be visible here:
//   · Language and Theme are SEGMENTED controls, not a swap row and a "Dark" switch.
//   · Security & Access carries Password · 2FA · Biometric.
//   · There is NO `SAVE CHANGES` footer on settings and NO `SAVE PROFILE` on the profile.
//   · The profile keeps the bottom nav — the drawing suppresses it for a "Transactional/Focused"
//     screen, and decision E5 made this one read-only, so that reason does not reach it.
//
// ── THE PASSWORD ROW IS VISIBLE HERE, AND THAT IS CORRECT ─────────────────────────────────────
//
// This header claimed the opposite on its first draft — "the seeded SITE_ENGINEER is Path A, so
// this frame shows the row absent" — and the first run disproved it on sight. MEASURED against the
// running database on 2026-09-13: every one of the thirteen accounts `seed-realistic.ts` writes
// carries BOTH a phone number and an email (`waraporn.k@ekachai.co.th` for this one). So this
// account is Path B by the only test the client has, the Password row belongs on it, and the frame
// is right.
//
// THE SEED THEREFORE PRODUCES NO PATH A ACCOUNT AT ALL, which also means these captures cannot
// photograph the absent row. §5.4.4 says an account carries exactly one identifier and
// `UserService.createUser` refuses a request carrying both — the seed writes its rows directly and
// is not bound by that check. The ADR-104 behaviour is held by the render tests instead
// (`AccountSettings.spec.tsx`, "does not draw it at all on a Path A account"), where `email: ''` —
// what `provisionPhoneUser` actually writes — can be set.
//
// Prerequisites: docker compose --profile full up -d · backend on :3000 · seed-realistic +
// provision-keycloak-demo · emulator booted with the debug APK (which MUST be rebuilt since
// 2026-09-13 — `/profile` imports expo-image-picker, a native module the older APK does not carry)
// · Metro started with EXPO_PUBLIC_CAPTURE=1.
// Run: node scripts/capture-android-settings-profile.mjs

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCREENS = resolve(HERE, '../../../docs/screens/android/02-shared');
const PKG = 'com.constructionos.cos';

const OTP_PHONE = process.env['COS_CAPTURE_PHONE'] ?? '0811000009'; // seeded SITE_ENGINEER
const OTP_CODE = process.env['E2E_TEST_OTP'] ?? '123456';
const OUT_NAME = process.env['COS_CAPTURE_ROLE'] ?? '01-site-engineer';

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
    adb('shell', 'input', 'tap', String(centreOf(node).x), String(centreOf(node).y));
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
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, png);
}

/**
 * FULL PAGE BY SHRINKING THE SCREEN, NOT BY SCROLLING IT — see the header.
 *
 * ALWAYS RESTORED, in a finally: leaving a developer's emulator at a density they did not choose is
 * the kind of side effect that gets blamed on something else a week later.
 */
/**
 * PER SCREEN, because the two pages are not the same length and one number cannot serve both.
 *
 * Settings runs to four groups and needs 200 to fit. The profile is four fields and a head: at 200
 * it fits with half the frame left empty, and at the device's own 420 the USER ID row and the
 * closing note fall below the fold — both measured on 2026-09-13, the second after this script had
 * been changed to shoot it at native density on the assumption that it fit. 300 is the value that
 * holds the whole page with the content still at a legible size.
 */
const DENSITY = { settings: process.env['COS_CAPTURE_DENSITY'] ?? '200', profile: '300' };

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
      (n) => n.includes(`text="${label}"`) && n.includes('bounds=') && !n.includes(PKG + ':id'),
    );
    if (!node) continue;
    adb('shell', 'input', 'tap', String(centreOf(node).x), String(centreOf(node).y));
    await delay(1500);
    return;
  }
}

async function loginPathA(phone) {
  console.log(`· Path A login as ${phone}`);
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
      console.log('· no OTP step — waiting out the 60s resend cooldown, then asking again');
      await delay(62_000);
      await tap(byId('request-otp-button'), 'request OTP button (after cooldown)');
    }
  }
  await find(byId('otp-input'), 'OTP input');
  await typeInto(byId('otp-input'), OTP_CODE, 'OTP input');
  await hideKeyboard();
  await tap(byId('verify-otp-button'), 'verify OTP button');
}

/** Answer the project picker if this role is given one — it sits OVER the shell. */
async function answerProjectPicker() {
  if (!(await present(byId('select-project-screen')))) return;
  console.log('· choosing a project');
  for (let attempt = 0; attempt < 3 && (await present(byId('select-project-failed'))); attempt++) {
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
      /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.test(n),
  );
  if (row) {
    const c = centreOf(row);
    adb('shell', 'input', 'tap', String(c.x), String(c.y));
    await delay(1500);
  }
}

async function main() {
  for (const p of ['tcp:8081', 'tcp:3000', 'tcp:8090']) adb('reverse', p, p);

  // Fresh start: `pm clear` drops the offline DB and any stored session, so the run always begins
  // at the login screen rather than resuming someone else's.
  adb('shell', 'am', 'force-stop', PKG);
  adb('shell', 'pm', 'clear', PKG);
  adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
  console.log('· app launched, waiting for the JS bundle');
  await delay(30_000);
  await dismissDevBanners();

  await loginPathA(OTP_PHONE);
  // `.catch`, NOT a bare await — the project picker sits OVER the shell for the roles that get one,
  // so `drawer-menu-button` is genuinely absent until it is answered. The first run of this script
  // died here with "signed-in shell never appeared" while the emulator was plainly showing the
  // picker. The sibling drawer script has the same catch for the same reason.
  await find(byId('drawer-menu-button'), 'signed-in shell', 40).catch(() => undefined);
  console.log('· signed in');
  await answerProjectPicker();
  await find(byId('drawer-menu-button'), 'signed-in shell (picker answered)', 40);

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
  await withShrunkScreen(DENSITY.settings, async () => {
    await find(byId('account-settings'), 'account settings at capture density', 30);
    await delay(3000);
    grab(join(SCREENS, '04-account-settings', `${OUT_NAME}.png`));
    console.log(`  saved 04-account-settings/${OUT_NAME}.png`);
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
    grab(join(SCREENS, '05-profile', `${OUT_NAME}.png`));
    console.log(`  saved 05-profile/${OUT_NAME}.png`);
  });

  console.log(`\nDone → ${SCREENS}`);
}

main().catch((err) => {
  // Restore the density even when the run dies mid-capture — `withShrunkScreen`'s finally only
  // covers a throw INSIDE it, and a failure to find a screen happens before it is entered.
  try {
    adb('shell', 'wm', 'density', 'reset');
  } catch {
    /* the emulator is gone; nothing to restore */
  }
  console.error(err.message ?? err);
  process.exit(1);
});
