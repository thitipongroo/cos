// Tenant Admin Home screenshot capture — adb/uiautomator only, same approach as
// capture-android-home.mjs (see capture-android-login.mjs for why Detox cannot drive these flows).
//
// Writes docs/screens/android/29-tenant-admin-home.png: the TENANT_ADMIN landing dashboard
// (mockup/mobile/04_tenant_admin/00_home/01_home_admin/) with live data — system status, pending
// approvals (payments + POs) and AI token usage — reached through a real Path A (SMS OTP) login as
// the seeded TENANT_ADMIN (Suphaporn Rattanakul, +66811000002). Office roles enrol MFA in the
// browser (Path B); the Direct-Grant OTP path used here provisions a phone username + password with
// no TOTP required action, so the same account logs in either way (provision-keycloak-demo.ts).
//
// Prerequisites (all must already be running):
//   - emulator booted, debug app installed. A debug APK loads its JS from Metro, so it does NOT need
//     rebuilding when only JS/asset code changed.
//   - Metro:    npx expo start   (the app targets EXPO_PUBLIC_API_URL, default http://localhost:3000/api/v1)
//   - backend with E2E_AUTH_BYPASS=true on :3000 (fixed OTP), Kafka up (the backend exits without it)
//   - database seeded with backend/prisma/seed-realistic.ts and users provisioned into Keycloak with
//     backend/prisma/provision-keycloak-demo.ts (that script gives phone-holders a phone username,
//     which is what makes Path A possible at all)
//   - adb reverse tcp:8081/tcp:3000/tcp:8090 (this script re-asserts them)
// Run: node scripts/capture-android-tenant-admin-home.mjs

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../../docs/screens/android');
const PKG = 'com.constructionos.cos';

// Suphaporn Rattanakul — TENANT_ADMIN at Ekachai (seed-realistic.ts). National format: the login
// screen prefixes +66 from the country picker, so +66811000002 is typed as 0811000002.
const OTP_PHONE = process.env['E2E_OTP_PHONE'] ?? '0811000002';
const OTP_CODE = process.env['E2E_TEST_OTP'] ?? '123456';
// The dashboard now matches its mockup (PO 2026-07-25 full parity), which has no project picker — the
// screen auto-selects the active project from the offline cache, so there is no chip to tap.

const SDK = process.env['ANDROID_HOME'] ?? process.env['ANDROID_SDK_ROOT'] ?? '';
const ADB = SDK
  ? join(SDK, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
  : 'adb';

const adb = (...args) => execFileSync(ADB, args, { maxBuffer: 16 * 1024 * 1024 }).toString();
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A dump only succeeds once the window is idle; mid-transition it fails with
 *   ERROR: null root node returned by UiTestAutomationBridge.
 * and leaves the previous /sdcard/ui.xml in place, so a naive read silently returns the *last*
 * screen. Delete first, and trust the file only when the tool says it wrote one.
 */
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
// Prefix match — for dynamic testIDs like `review-<uuid>` where the exact id is not known up front.
const byIdPrefix = (id) => (n) => n.includes(`resource-id="${id}`);

async function tap(pred, what) {
  const c = await find(pred, what);
  adb('shell', 'input', 'tap', String(c.x), String(c.y));
  await delay(900);
}

/** RN's LogBox notification ("Open debugger to view warnings.") — debug-only, keep it out of docs. */
async function dismissDevBanners() {
  for (let i = 0; i < 6; i++) {
    const node = (await dump()).find(
      (n) => n.includes('content-desc="!,') && n.includes('clickable="true"'),
    );
    if (!node) return;
    const m = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node);
    if (!m) return;
    // The dismiss X is an unlabelled child at the banner's right edge.
    adb('shell', 'input', 'tap', String(+m[3] - 58), String(Math.round((+m[2] + +m[4]) / 2)));
    await delay(800);
  }
}

/**
 * Gboard shows one-time onboarding ("Try out your stylus") the first time it opens on a fresh
 * emulator, and it covers the screen — it silently replaced the OTP screen in an earlier run.
 */
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

async function keyboardUp() {
  return adb('shell', 'dumpsys', 'input_method').includes('mInputShown=true');
}

/**
 * Close the soft keyboard with ESC, not BACK. BACK only stops at the IME while it is really showing,
 * and `mInputShown` goes stale — a BACK sent on a stale reading falls through to the activity, which
 * on the root login route quits the app. ESC is a no-op for the RN screen, so a wrong guess is free.
 */
async function hideKeyboard() {
  if (!(await keyboardUp())) return;
  adb('shell', 'input', 'keyevent', '111'); // KEYCODE_ESCAPE
  await delay(1200);
}

async function type(text) {
  adb('shell', 'input', 'text', text);
  await delay(600);
  await dismissImeOnboarding();
}

async function shot(name) {
  const png = execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
  // A PNG that small is a black/blank frame, not a screen.
  if (png.length < 20_000) throw new Error(`capture: ${name} screenshot looks empty`);
  writeFileSync(join(OUT, `${name}.png`), png);
  console.log(`  saved ${name}.png (${png.length} bytes)`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  for (const p of ['tcp:8081', 'tcp:3000', 'tcp:8090']) adb('reverse', p, p);

  // Fresh start: pm clear drops the offline DB + any stored session, so the run always begins at the
  // login screen rather than resuming someone else's.
  adb('shell', 'am', 'force-stop', PKG);
  adb('shell', 'pm', 'clear', PKG);
  adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
  console.log('· app launched, waiting for the JS bundle');
  await delay(30_000);
  await dismissDevBanners();

  console.log(`· Path A login as ${OTP_PHONE} (TH national format)`);
  await tap(byId('phone-input'), 'phone input');
  await type(OTP_PHONE);
  await hideKeyboard();
  await tap(byId('request-otp-button'), 'request OTP button');

  await find(byId('otp-input'), 'OTP input');
  await tap(byId('otp-input'), 'OTP input');
  await type(OTP_CODE);
  await hideKeyboard();
  await tap(byId('verify-otp-button'), 'verify OTP button');

  console.log('· waiting for the Tenant Admin Home');
  // Asserting the testID (not a fixed sleep) is what stops a mis-tap from being photographed: if the
  // app landed anywhere else, this throws instead of saving a screenshot of the wrong screen.
  await find(byId('tenant-admin-home'), 'tenant-admin-home', 40);
  await dismissDevBanners();

  // TenantAdminHome fetches system status, pending approvals (payments + POs) and AI token usage
  // (TenantAdminHome.tsx). Give those fetches time to land after the landing testID appears.
  console.log('· waiting for the admin dashboard data');
  await delay(6000);
  await dismissDevBanners();

  // Assert the system-status card actually rendered — a mis-tap or an empty dashboard then fails
  // loudly instead of being photographed.
  await find(byId('admin-system-status'), 'admin system-status card');

  await shot('29-tenant-admin-home');

  // Quick-Add menu — the FAB target (mockup 02_quick_add_menu). Open it, assert the sheet, capture it,
  // then close it before moving on.
  console.log('· Quick-Add menu (FAB)');
  await tap(byId('quick-add-fab'), 'quick-add FAB');
  await find(byId('quick-add-menu'), 'quick-add-menu', 15);
  await delay(1500);
  await shot('31-tenant-admin-quick-add');
  await tap(byId('quick-add-close'), 'quick-add close');
  await delay(1000);

  // Users tab — the tenant admin's team-management screen (GET /users). Tap the tab, assert the list
  // rendered (not a mis-tap or an empty state), then capture it too.
  console.log('· Users tab');
  await tap(byId('users-tab'), 'Users tab');
  await find(byId('tenant-admin-users'), 'tenant-admin-users', 20);
  await delay(3000);
  await dismissDevBanners();
  await shot('30-tenant-admin-users');

  // Alerts tab — the sync-review queue (mockup 03_alerts). Capture the populated list, then expand the
  // first conflict's client-vs-server diff and capture that too.
  console.log('· Alerts tab (sync queue)');
  await tap(byId('sync-queue-tab'), 'Alerts tab');
  await find(byId('tenant-admin-sync-queue'), 'tenant-admin-sync-queue', 20);
  await delay(2500);
  await shot('32-tenant-admin-alerts');
  await tap(byIdPrefix('review-'), 'first "Review data"');
  await delay(1500);
  await shot('33-tenant-admin-alerts-diff');

  console.log('done.');
}

main().catch((err) => {
  console.error(String(err.message ?? err));
  process.exit(1);
});
