// Android CRM screenshot capture — adb/uiautomator only, like every sibling script.
//
// Writes the three §20.7.10 pages to docs/screens/android/CRM-SALES-MANAGER/. They live under a
// role folder, not 02-shared, because only CRM_SALES_MANAGER has them as tabs.
//
// Signed in as Chalermsak Nithat (+66811000012, seed-realistic.ts) — the only seeded
// CRM_SALES_MANAGER. Role matters twice here: the tabs exist only for this role, and every CRM
// endpoint is role-gated server-side (CRM_READ_ROLES / CRM_WRITE_ROLES in crm.controller.ts), so any
// other account would render four tabs it cannot populate.
//
// Shell is DARK — the product default for every role since 2026-08-04 (themeStore.ts).
//
// Prerequisites (all must already be running):
//   - emulator booted, debug app installed
//   - docker: postgres, pgbouncer, redis, keycloak, kafka, schema-registry
//   - migrations + prisma/seed.ts + prisma/seed-realistic.ts applied
//   - backend on :3000 with E2E_AUTH_BYPASS=true (fixes the OTP to OTP_CODE below)
//   - Metro: EXPO_PUBLIC_CAPTURE=1 EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1 npx expo start
// Run: node scripts/capture-android-crm.mjs

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../../docs/screens/android/CRM-SALES-MANAGER');
const PKG = 'com.constructionos.cos';

const OTP_PHONE = process.env['E2E_OTP_PHONE'] ?? '0811000012';
const OTP_CODE = process.env['E2E_TEST_OTP'] ?? '123456';

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

async function find(pred, what, tries = 25) {
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
  await delay(1200);
}

async function type(text) {
  adb('shell', 'input', 'text', text);
  await delay(600);
}

async function hideKeyboard() {
  if (!adb('shell', 'dumpsys', 'input_method').includes('mInputShown=true')) return;
  adb('shell', 'input', 'keyevent', '111'); // ESC — never BACK, which can quit from the root route
  await delay(1000);
}

/** RN's LogBox toast — debug-only, keep it out of the docs. */
async function dismissDevBanners() {
  for (let i = 0; i < 6; i++) {
    const node = (await dump()).find(
      (n) => n.includes('content-desc="!,') && n.includes('clickable="true"'),
    );
    if (!node) return;
    const m = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node);
    if (!m) return;
    adb('shell', 'input', 'tap', String(+m[3] - 58), String(Math.round((+m[2] + +m[4]) / 2)));
    await delay(800);
  }
}

/**
 * Plain single-viewport grab — no stitching.
 *
 * Deliberate: each CRM screen is a short form plus a list that fits one viewport on the Medium_Phone
 * AVD, and these are TOP-LEVEL TAB screens, so they carry no breadcrumb strip. Running the full-page
 * stitcher would mean re-deriving its fixed chrome band for a layout that does not need it, and a
 * mis-set band silently truncates the output (see the TOP note in capture-android-transparency.mjs).
 */
function grab(name) {
  const dest = join(OUT, `${name}.png`);
  mkdirSync(dirname(dest), { recursive: true });
  const png = execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
  if (png.length < 20_000) throw new Error(`capture: ${name} screenshot looks empty`);
  writeFileSync(dest, png);
  console.log(`  saved ${name}.png (${png.length} bytes)`);
}

const TABS = [
  { tab: 'leads-tab', screen: 'leads-screen', file: '01-leads' },
  { tab: 'opportunities-tab', screen: 'opportunities-screen', file: '02-opportunities' },
  { tab: 'customers-tab', screen: 'customers-screen', file: '03-customers' },
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  for (const p of ['tcp:8081', 'tcp:3000', 'tcp:8090']) adb('reverse', p, p);

  adb('shell', 'am', 'force-stop', PKG);
  adb('shell', 'pm', 'clear', PKG);
  adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
  console.log('· app launched, waiting for the JS bundle');
  await delay(30_000);
  await dismissDevBanners();

  console.log(`· Path A login as ${OTP_PHONE} (CRM_SALES_MANAGER)`);
  await tap(byId('phone-input'), 'phone input');
  await type(OTP_PHONE);
  await hideKeyboard();
  await tap(byId('request-otp-button'), 'request OTP button');
  await find(byId('otp-input'), 'OTP input');
  await tap(byId('otp-input'), 'OTP input');
  await type(OTP_CODE);
  await hideKeyboard();
  await tap(byId('verify-otp-button'), 'verify OTP button');

  console.log('· waiting for the app shell');
  await find(byId('drawer-menu-button'), 'signed-in top bar', 40);
  await dismissDevBanners();

  // MobileNav sets tabBarButtonTestID = `${tab.name}-tab` (React Navigation 7 renamed the prop).
  for (const s of TABS) {
    console.log(`· ${s.file}`);
    await tap(byId(s.tab), s.tab);
    // Assert the destination before photographing it — a mis-tap otherwise saves the wrong screen.
    await find(byId(s.screen), s.screen);
    await dismissDevBanners();
    await delay(1200);
    grab(s.file);
  }

  console.log(`\nDone → ${OUT}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
