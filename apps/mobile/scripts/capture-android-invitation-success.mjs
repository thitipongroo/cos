// Invitation-success screenshot capture — adb/uiautomator only. Logs in as TENANT_ADMIN, opens Quick
// Commands → Invite New User, fills a real invitation (name + a random unique phone + Project Manager),
// taps SEND INVITATION and captures the success screen (mockup 04_tenant_admin/00_home/
// 02_quick_action_button/01_invite_user/04_invitation_success):
//   docs/screens/android/TENANT_ADMIN/08-invitation-success.png
// A random phone is used so each run creates a fresh user (no 409). Prereqs: emulator + Metro
// (EXPO_PUBLIC_CAPTURE=1) + backend with E2E_AUTH_BYPASS=true.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../../docs/screens/android/TENANT_ADMIN');
const PKG = 'com.constructionos.cos';
const OTP_PHONE = process.env['E2E_OTP_PHONE'] ?? '0811000002';
const OTP_CODE = process.env['E2E_TEST_OTP'] ?? '123456';
// Random 10-digit national number (08xxxxxxxx) so each capture invites a fresh, unique recipient.
const INVITE_PHONE = '08' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');

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
  await delay(600);
}
async function shot(name) {
  const png = execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
  if (png.length < 20_000) throw new Error(`capture: ${name} screenshot looks empty`);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${name}.png`), png);
  console.log(`  saved ${name}.png (${png.length} bytes)`);
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
  await delay(1200);

  console.log(`· fill name + phone (${INVITE_PHONE})`);
  await tap(byId('invite-name'), 'name');
  await type('Somchai');
  await hideKeyboard();
  await tap(byId('invite-contact'), 'contact');
  await type(INVITE_PHONE);
  await hideKeyboard();

  // Reveal role cards, pick Project Manager.
  adb('shell', 'input', 'swipe', '540', '1700', '540', '650', '400');
  await delay(1200);
  await tap(byId('invite-role-PROJECT_MANAGER'), 'role PROJECT_MANAGER');
  await delay(500);

  console.log('· SEND INVITATION → invitation-success');
  await tap(byId('invite-send'), 'SEND INVITATION');
  await find(byId('invitation-success'), 'invitation-success', 30);
  await dismissDevBanners();
  await delay(1500);
  await shot('08-invitation-success');

  console.log('done.');
}

main().catch((err) => {
  console.error(String(err.message ?? err));
  process.exit(1);
});
