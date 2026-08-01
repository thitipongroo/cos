// Reset-password capture — adb/uiautomator only. Logs in as TENANT-ADMIN and captures BOTH reset paths
// (mockup 04_tenant_admin/02_users/02_user_management/05_reset_password + 06/07 success screens):
//   06-reset-password.png       — the form for a user WITH an email (email reset-link recommended)
//   08-reset-link-sent.png      — email path: standards-compliant Keycloak action-token link sent
//   07-temp-password-create.png — temp-password fallback for a phone-only (no-email) user, MASKED
// The temp success is captured with the password MASKED (default state) so no live credential is written
// into the committed screenshot. Both paths add a Keycloak UPDATE_PASSWORD required action to the target;
// the caller clears it afterwards (phone-only users also self-heal at their next OTP login).
// Prereqs: emulator + Metro (EXPO_PUBLIC_CAPTURE=1) + backend E2E_AUTH_BYPASS=true + MailHog + Python.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../../docs/screens/android/TENANT-ADMIN/02-Users');
const TMP = process.env['TEMP'] ?? process.env['TMP'] ?? HERE;
const STITCH = join(HERE, 'stitch-fullpage.py');
const PKG = 'com.constructionos.cos';
const OTP_PHONE = process.env['E2E_OTP_PHONE'] ?? '0811000002';
const OTP_CODE = process.env['E2E_TEST_OTP'] ?? '123456';
const EMAIL_TARGET = process.env['RESET_EMAIL_TARGET'] ?? 'Chalermsak Nithat';
const TEMP_TARGET = process.env['RESET_TEMP_TARGET'] ?? 'Somchai';

const SDK = process.env['ANDROID_HOME'] ?? process.env['ANDROID_SDK_ROOT'] ?? '';
const ADB = SDK ? join(SDK, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb') : 'adb';
const adb = (...a) => execFileSync(ADB, a, { maxBuffer: 16 * 1024 * 1024 }).toString();
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
async function find(pred, what, tries = 20) {
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
async function tapUserByName(name) {
  for (let i = 0; i < 14; i++) {
    const node = (await dump()).find((n) => n.includes(`text="${name}"`) && n.includes('bounds='));
    if (node) {
      const c = centreOf(node);
      adb('shell', 'input', 'tap', String(c.x), String(c.y));
      await delay(900);
      return;
    }
    adb('shell', 'input', 'swipe', '540', '1700', '540', '700', '400');
    await delay(1000);
  }
  throw new Error(`capture: user "${name}" never appeared`);
}
async function dismissDevBanners() {
  for (let i = 0; i < 6; i++) {
    const node = (await dump()).find((n) => n.includes('content-desc="!,') && n.includes('clickable="true"'));
    if (!node) return;
    const m = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node);
    if (!m) return;
    adb('shell', 'input', 'tap', String(+m[3] - 58), String(Math.round((+m[2] + +m[4]) / 2)));
    await delay(800);
  }
}
async function keyboardUp() {
  return adb('shell', 'dumpsys', 'input_method').includes('mInputShown=true');
}
async function hideKeyboard() {
  if (!(await keyboardUp())) return;
  adb('shell', 'input', 'keyevent', '111');
  await delay(1000);
}
// Gboard's one-time "Try out your stylus" onboarding covers the screen the first time the keyboard
// opens on a fresh emulator; dismiss it after typing so it never hides the login form.
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
function grab(path) {
  const png = execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
  if (png.length < 20_000) throw new Error(`capture: ${path} screenshot looks empty`);
  writeFileSync(path, png);
}
/** Rewind to the top, shoot descending viewports, stitch one full-page PNG. bot sits above the fixed
 *  footer / bottom nav; a short screen simply bottoms out at shot 0 and reproduces the single view. */
async function stitchFull(name, top = 180, bot = 1780) {
  mkdirSync(OUT, { recursive: true });
  for (let i = 0; i < 4; i++) {
    adb('shell', 'input', 'swipe', '540', '700', '540', '1700', '300');
    await delay(500);
  }
  await delay(700);
  const shots = [];
  for (let i = 0; i < 5; i++) {
    const p = join(TMP, `rp_${i}.png`);
    grab(p);
    shots.push(p);
    if (i < 4) {
      adb('shell', 'input', 'swipe', '540', '1700', '540', '650', '500');
      await delay(1200);
    }
  }
  const out = join(OUT, `${name}.png`);
  process.stdout.write(execFileSync('python', [STITCH, out, String(top), String(bot), ...shots], { encoding: 'utf-8' }));
  console.log(`  stitched ${name}.png`);
}

async function main() {
  for (const p of ['tcp:8081', 'tcp:3000', 'tcp:8090']) adb('reverse', p, p);
  adb('shell', 'am', 'force-stop', PKG);
  adb('shell', 'pm', 'clear', PKG);
  adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
  console.log('· app launched, waiting for the JS bundle');
  await delay(30_000);
  await dismissDevBanners();

  console.log(`· Path A login as ${OTP_PHONE} (TENANT-ADMIN)`);
  await tap(byId('phone-input'), 'phone input');
  await type(OTP_PHONE);
  await hideKeyboard();
  await tap(byId('request-otp-button'), 'request OTP button');
  await find(byId('otp-input'), 'OTP input');
  await tap(byId('otp-input'), 'OTP input');
  await type(OTP_CODE);
  await hideKeyboard();
  await tap(byId('verify-otp-button'), 'verify OTP button');
  await find(byId('tenant-admin-home'), 'tenant-admin-home', 40);
  await dismissDevBanners();
  await delay(2000);

  // ── Email path (standards-compliant): an email user shows the reset-link method recommended ──
  console.log(`· Users tab → ${EMAIL_TARGET} (has email) → profile → Reset password`);
  await tap(byId('users-tab'), 'Users tab');
  await find(byId('tenant-admin-users'), 'tenant-admin-users', 20);
  await delay(3000);
  await dismissDevBanners();
  await tapUserByName(EMAIL_TARGET);
  await find(byId('user-profile'), 'user-profile', 20);
  await delay(1200);
  await tap(byId('profile-reset-password'), 'Reset password');
  await find(byId('reset-password'), 'reset-password', 20);
  await dismissDevBanners();
  await delay(1500);

  console.log('· full-page reset password form (email method recommended)');
  await stitchFull('06-reset-password', 180, 1680);

  console.log('· CONFIRM RESET (email link) → reset-link-sent');
  await tap(byId('reset-confirm'), 'Confirm reset');
  await find(byId('reset-password-email-success'), 'reset-password-email-success', 25);
  await dismissDevBanners();
  await delay(1500);
  await stitchFull('08-reset-link-sent', 180, 1780);

  // ── Temp-password fallback: a phone-only user (no email) → temporary password ──
  console.log(`· back to Users → ${TEMP_TARGET} (no email) → Reset password → temp`);
  await tap(byId('reset-link-done'), 'Return to user list');
  await find(byId('tenant-admin-users'), 'tenant-admin-users', 20);
  await delay(2500);
  await dismissDevBanners();
  await tapUserByName(TEMP_TARGET);
  await find(byId('user-profile'), 'user-profile', 20);
  await delay(1200);
  await tap(byId('profile-reset-password'), 'Reset password');
  await find(byId('reset-password'), 'reset-password', 20);
  await dismissDevBanners();
  await delay(1200);

  console.log('· CONFIRM RESET (temp password stays masked) → temp success');
  await tap(byId('reset-confirm'), 'Confirm reset');
  await find(byId('reset-password-success'), 'reset-password-success', 25);
  await dismissDevBanners();
  await delay(1500);
  await stitchFull('07-temp-password-create', 180, 1780);

  console.log('done.');
}

main().catch((err) => {
  console.error(String(err.message ?? err));
  process.exit(1);
});
