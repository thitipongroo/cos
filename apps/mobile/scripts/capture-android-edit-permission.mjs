// Edit-permission capture — adb/uiautomator only. Logs in as TENANT_ADMIN, opens the Users tab, opens
// the profile of a MULTI-ROLE user (Thanawat Boonmee — primary PROJECT_MANAGER + additional
// SAFETY_OFFICER), taps "Edit permissions" and captures the multi-role editor as ONE full-page image
// (mockup 04_tenant_admin/02_users/02_user_management/03_edit_permission):
//   docs/screens/android/TENANT_ADMIN/02-Users/04-edit-permission.png
// Prereqs: emulator + Metro (EXPO_PUBLIC_CAPTURE=1) + backend with E2E_AUTH_BYPASS=true + Python +
// seed-realistic (Thanawat's additional SAFETY_OFFICER role).

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../../docs/screens/android/TENANT_ADMIN/02-Users');
const TMP = process.env['TEMP'] ?? process.env['TMP'] ?? HERE;
const STITCH = join(HERE, 'stitch-fullpage.py');
const PKG = 'com.constructionos.cos';
const OTP_PHONE = process.env['E2E_OTP_PHONE'] ?? '0811000002';
const OTP_CODE = process.env['E2E_TEST_OTP'] ?? '123456';

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
/** Rewind to the top, shoot descending viewports, stitch one full-page PNG. bot=1780 sits above the
 *  fixed footer (Save changes / Cancel); footer + bottom-nav appended once. */
async function stitchFull(name, top = 180, bot = 1780) {
  mkdirSync(OUT, { recursive: true });
  for (let i = 0; i < 5; i++) {
    adb('shell', 'input', 'swipe', '540', '700', '540', '1700', '300');
    await delay(500);
  }
  await delay(700);
  const shots = [];
  // ≈700px step for unambiguous overlap on the repeating CRUD matrix, but only enough shots (9) to just
  // reach the bottom — over-scrolling past it lets a stray bottom shot false-match and duplicate a card.
  for (let i = 0; i < 9; i++) {
    const p = join(TMP, `ep_${i}.png`);
    grab(p);
    shots.push(p);
    if (i < 8) {
      adb('shell', 'input', 'swipe', '540', '1700', '540', '1000', '400');
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

  console.log(`· Path A login as ${OTP_PHONE} (TENANT_ADMIN)`);
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

  console.log('· Users tab → Thanawat Boonmee (PM + Safety) → profile → Edit permissions');
  await tap(byId('users-tab'), 'Users tab');
  await find(byId('tenant-admin-users'), 'tenant-admin-users', 20);
  await delay(3000);
  await dismissDevBanners();
  await tapUserByName('Thanawat Boonmee');
  await find(byId('user-profile'), 'user-profile', 20);
  await delay(1200);
  await tap(byId('profile-edit-permissions'), 'Edit permissions');
  await find(byId('edit-permission'), 'edit-permission', 20);
  await dismissDevBanners();
  await delay(2000); // let role permissions load + the union matrix render

  console.log('· full-page edit permission');
  await stitchFull('04-edit-permission', 310);

  console.log('done.');
}

main().catch((err) => {
  console.error(String(err.message ?? err));
  process.exit(1);
});
