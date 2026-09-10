// Android Get Help screenshot capture — adb/uiautomator only, same approach as every sibling
// capture-android-*.mjs (deliberately NOT Detox; see capture-android-login.mjs for why).
//
// Produces, under docs/screens/android/01-authen/05-get-help/:
//   01-home-support      the Support Centre, with the two cards that now carry chevrons
//   02-hotline-details   the IT Support Hotline detail screen
//   03-help-chat         the Help Chat screen
//
// Drawings: mockup/mobile/01_authen/05_get_help/{01_home_support,02_hotline_details,03_help_chat}.
//
// ── IT NEVER SIGNS IN, AND THAT IS THE POINT ───────────────────────────────────────────────────
//
// All three screens are reachable BEFORE authentication: the Support Centre is entered from the OTP
// step's GET SUPPORT link, and its two children are `(auth)` routes of their own. The chat is open
// on both sides of login (ADR-093 decision 3), and the hotline is a child of the Support Centre on
// both sides — but the pre-auth pair is what this script shoots, because it needs no account.
//
// So the run is: launch → type a phone → request an OTP → land on the OTP step → GET SUPPORT. The
// OTP is never verified. That also means this script does NOT need seeded demo data or Keycloak,
// only Metro and a backend that answers `POST /auth/otp/request`.
//
// THE PRE-AUTH SURFACES ARE PINNED DARK (§32.7), so every frame here is the dark shell regardless
// of the emulator's theme.
//
// Prerequisites: backend on :3000, emulator booted with the debug APK, Metro started with
// EXPO_PUBLIC_CAPTURE=1.
// Run: node scripts/capture-android-get-help.mjs [home|hotline|chat]

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../../docs/screens/android/01-authen/05-get-help');
const TMP = process.env['TEMP'] ?? process.env['TMP'] ?? HERE;
const STITCH = join(HERE, 'stitch-fullpage.py');
const PKG = 'com.constructionos.cos';

const OTP_PHONE = process.env['E2E_OTP_PHONE'] ?? '0811000012';

// Fixed bands on the Medium_Phone AVD (1080×2400), the values every sibling script documents. These
// screens carry NO bottom nav — they are pre-auth — so the band runs to the bottom of the viewport
// rather than stopping at 2196.
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
    await delay(500);
  }
  throw new Error('capture: uiautomator never produced a dump');
}

function centreOf(node) {
  const m = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node);
  if (!m) throw new Error('capture: node has no bounds');
  return { x: (+m[1] + +m[3]) / 2 | 0, y: (+m[2] + +m[4]) / 2 | 0 };
}

const byId = (id) => (n) => n.includes(`resource-id="${id}"`);

async function find(pred, what, tries = 30) {
  for (let i = 0; i < tries; i++) {
    const node = (await dump()).find((n) => pred(n) && n.includes('bounds='));
    if (node) return centreOf(node);
    await delay(1000);
  }
  throw new Error(`capture: ${what} never appeared`);
}

async function tap(pred, what) {
  const c = await find(pred, what);
  adb('shell', 'input', 'tap', String(c.x), String(c.y));
  await delay(900);
}

async function type(text) {
  adb('shell', 'input', 'text', text);
  await delay(400);
}

function hideKeyboard() {
  adb('shell', 'input', 'keyevent', '111'); // ESC — closes the IME without a back-navigation
}

function grab(path) {
  const png = execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
  if (png.length < 20_000) throw new Error(`capture: ${path} screenshot looks empty`);
  writeFileSync(path, png);
}

/** Rewind, shoot descending viewports, stitch ONE full-page PNG (docs/screens/android/README.md). */
async function stitchFull(name, shots = 6) {
  const dest = join(OUT, `${name}.png`);
  mkdirSync(dirname(dest), { recursive: true });
  for (let i = 0; i < 6; i++) {
    adb('shell', 'input', 'swipe', '540', '700', '540', '1800', '300');
    await delay(500);
  }
  await delay(900);
  const frames = [];
  for (let i = 0; i < shots; i++) {
    const p = join(TMP, `gh_${name.replace(/[^a-z0-9]/gi, '_')}_${i}.png`);
    grab(p);
    frames.push(p);
    if (i < shots - 1) {
      adb('shell', 'input', 'swipe', '540', '1700', '540', '1100', '500');
      await delay(1500);
    }
  }
  process.stdout.write(
    execFileSync('python', [STITCH, dest, String(TOP), String(BOT), '--max-scroll', '900', ...frames], {
      encoding: 'utf-8',
    }),
  );
  console.log(`  stitched ${name}.png`);
}

const ONLY = new Set(process.argv.slice(2));
const wanted = (key) => ONLY.size === 0 || ONLY.has(key);
const METRO_PORT = process.env['METRO_PORT'] ?? '8081';

// Targets: home hotline chat
async function main() {
  mkdirSync(OUT, { recursive: true });
  adb('reverse', 'tcp:8081', `tcp:${METRO_PORT}`);
  adb('reverse', 'tcp:3000', 'tcp:3000');

  adb('shell', 'am', 'force-stop', PKG);
  adb('shell', 'pm', 'clear', PKG);
  adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
  console.log('· app launched, waiting for the JS bundle');
  await delay(30_000);

  // The OTP step, without verifying it — GET SUPPORT lives in that step's footer.
  console.log(`· requesting an OTP for ${OTP_PHONE} to reach the OTP step`);
  await tap(byId('phone-input'), 'phone input');
  await type(OTP_PHONE);
  hideKeyboard();
  await delay(600);
  await tap(byId('request-otp-button'), 'request OTP button');
  await find(byId('get-support-link'), 'GET SUPPORT link', 40);

  console.log('· Support Centre');
  await tap(byId('get-support-link'), 'GET SUPPORT link');
  await find(byId('support'), 'Support Centre', 30);
  // One health probe settles behind the status card.
  await delay(4000);
  if (wanted('home')) await stitchFull('01-home-support');

  if (wanted('hotline')) {
    console.log('· IT Support Hotline');
    await tap(byId('support-it-hotline'), 'IT Hotline card');
    await find(byId('support-hotline'), 'hotline screen', 30);
    await delay(1500);
    await stitchFull('02-hotline-details');
    adb('shell', 'input', 'keyevent', '4'); // back to the Support Centre
    await find(byId('support'), 'Support Centre', 30);
    await delay(1200);
  }

  if (wanted('chat')) {
    console.log('· Help Chat');
    await tap(byId('support-quick-chat'), 'Help Chat card');
    await find(byId('help-chat'), 'chat screen', 30);
    await delay(1500);
    // The thread is short and the composer is pinned: one viewport is the whole screen.
    await stitchFull('03-help-chat', 1);
  }

  console.log(`\nDone → ${OUT}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
