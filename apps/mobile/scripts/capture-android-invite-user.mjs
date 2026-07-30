// Invite-user screenshot capture — adb/uiautomator only (same approach as capture-android-home.mjs).
// Logs in as the TENANT_ADMIN (+66811000002), opens the FAB's Quick Commands overlay → Invite New User,
// and captures the invite form (mockup 04_tenant_admin/01_home/02_quick_action_button/02_invite_user/
// 02_invite_user_via_phone) as ONE full-page image per method (each stitched from scrolling viewports
// via scripts/stitch-fullpage.py):
//   docs/screens/android/TENANT_ADMIN/01-Home/03-invite-user-phone.png  — phone method, complete filled form
//   docs/screens/android/TENANT_ADMIN/01-Home/03-invite-user-email.png  — the EMAIL method, complete form
// Prereqs are the same as capture-android-home.mjs, plus Metro started with EXPO_PUBLIC_CAPTURE=1 so the
// dev LogBox toast is suppressed, plus Python (Pillow/numpy) for the stitch. Run:
//   node scripts/capture-android-invite-user.mjs

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../../docs/screens/android/TENANT_ADMIN/01-Home');
const TMP = process.env['TEMP'] ?? process.env['TMP'] ?? HERE; // scratch for the intermediate viewports
const STITCH = join(HERE, 'stitch-fullpage.py');
const PKG = 'com.constructionos.cos';
const OTP_PHONE = process.env['E2E_OTP_PHONE'] ?? '0811000002'; // Suphaporn Rattanakul — TENANT_ADMIN
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
async function type(text) {
  adb('shell', 'input', 'text', text);
  await delay(500);
}
function grab(path) {
  const png = execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
  if (png.length < 20_000) throw new Error(`capture: ${path} screenshot looks empty`);
  writeFileSync(path, png);
}
/**
 * Rewind the form to the top, then shoot several descending viewports and stitch them into ONE
 * full-page PNG via scripts/stitch-fullpage.py (TOP/BOT = the fixed top-bar / bottom boundaries kept
 * once). This screen is a pushed child route (global TopBar, no bottom-nav), so BOT sits near the
 * screen bottom — same crop the system-integration full-page uses.
 */
// bot=1780 sits just above the FIXED footer (SEND / CANCEL) so the scroll window never re-includes it;
// the footer + bottom-nav are appended once from the last shot's [bot:] slice.
async function stitchFull(name, top = 180, bot = 1780) {
  mkdirSync(OUT, { recursive: true });
  // Rewind to the top. Start the drag mid-scrollview (y=700) — a drag begun over the fixed footer
  // buttons (CANCEL / SEND, ~y1900) is swallowed and never scrolls.
  for (let i = 0; i < 5; i++) {
    adb('shell', 'input', 'swipe', '540', '700', '540', '1700', '300');
    await delay(500);
  }
  await delay(700);
  const shots = [];
  for (let i = 0; i < 6; i++) {
    const p = join(TMP, `iu_${name.replace(/[^a-z0-9]/gi, '_')}_${i}.png`);
    grab(p);
    shots.push(p);
    if (i < 5) {
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

  console.log('· Quick Commands → Invite New User');
  await tap(byId('quick-add-fab'), 'quick-add FAB');
  await tap(byId('quick-add-invite'), 'Invite New User', 20);
  await find(byId('invite-user'), 'invite-user', 20);
  await dismissDevBanners();
  await delay(1500);

  // Fill the form so the full page shows a real, valid invitation (name + phone) and select a role so
  // the CORE_AI banner is role-aware ("…for the Project Manager role") rather than the no-role default.
  console.log('· fill name + phone + role (phone method)');
  await tap(byId('invite-name'), 'name');
  await type('Somchai Jaidee');
  await hideKeyboard();
  await tap(byId('invite-contact'), 'contact');
  await type('812345678');
  await hideKeyboard();
  // Reveal the role card (below the fold) and select it — a pre-scroll adb tap misses it.
  adb('shell', 'input', 'swipe', '540', '1700', '540', '650', '400');
  await delay(1500);
  await tap(byId('invite-role-PROJECT_MANAGER'), 'role PROJECT_MANAGER');
  await delay(700);

  // Full page: the complete phone-method form (header → role cards → AI panel → footer) in one image.
  console.log('· full-page phone method');
  await stitchFull('03-invite-user-phone');

  // Switch to the EMAIL method and capture that state full-page too (the contact field clears on
  // switch; type a sample address so the field is shown filled).
  console.log('· full-page EMAIL method');
  for (let i = 0; i < 3; i++) {
    adb('shell', 'input', 'swipe', '540', '700', '540', '1800', '300');
    await delay(500);
  }
  await tap(byId('invite-method-email'), 'email tab');
  await delay(800);
  await tap(byId('invite-contact'), 'contact');
  await type('somchai@example.com');
  await hideKeyboard();
  await stitchFull('03-invite-user-email');

  console.log('done.');
}

main().catch((err) => {
  console.error(String(err.message ?? err));
  process.exit(1);
});
