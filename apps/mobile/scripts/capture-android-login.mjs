// Android login-flow screenshot capture — adb/uiautomator only, deliberately NOT Detox.
//
// Writes the four public login screens to docs/screens/android/01-authen/01-login/ — the same flow as
// the web set (docs/screens/web/01-public/00-login.png … 03-login-loading.png). The native splash and
// the app-launch loading state are NOT here: they moved to docs/screens/android/00-loading/, which is
// why the login screens now number from 01:
//   01-login             landing (Path A phone form + Path B "Login with Email" secondary action)
//   02-login-otp-verify  OTP-verify step, reached by requesting a passcode from the landing
//   03-login-password    Keycloak's hosted email/password page (Path B, §20.6.1 / QM-4)
//   04-login-loading     VerifyingOverlay, shown while the Path B code→token exchange is in flight
//
// WHY NOT DETOX: Path B hands off to Keycloak in a Chrome Custom Tab. While Detox holds the
// UiAutomation connection, `uiautomator dump` only ever returns the instrumented app's window — a
// dump taken with Detox attached reports exactly one package, com.constructionos.cos — so the
// Keycloak form is invisible to every matcher and the flow can only be driven blind (it isn't: the
// taps land back in the app). Detached, uiautomator sees both the RN app (testID → resource-id) and
// the browser, so plain adb can drive the whole flow and each frame can be checked before it is kept.
//
// Prerequisites (all must already be running):
//   - emulator booted, debug app installed (android/app/build/outputs/apk/debug/app-debug.apk)
//   - Metro:    EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1 npx expo start
//   - backend with E2E_AUTH_BYPASS=true on :3000, Keycloak on :8090, realm seeded+provisioned
//   - adb reverse tcp:8081/tcp:3000/tcp:8090 (this script re-asserts them)
//   - Chrome's first-run screens dismissed once on the emulator
// Run: node scripts/capture-android-login.mjs

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../../docs/screens/android/01-authen/01-login');
const PKG = 'com.constructionos.cos';

// Path B demo account — seeded by backend/prisma/seed-realistic.ts, given this password by
// backend/prisma/provision-keycloak-demo.ts (DEMO_USER_PASSWORD).
const DEMO_EMAIL = process.env['E2E_DEMO_EMAIL'] ?? 'wichai.e@ekachai.co.th';
const DEMO_PASSWORD = process.env['DEMO_USER_PASSWORD'] ?? 'Ekachai@2026';
// Any seeded phone reaches the OTP step; the backend's E2E bypass accepts a fixed code.
const OTP_PHONE = process.env['E2E_OTP_PHONE'] ?? '0811000010';

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
    await delay(700);
  }
  throw new Error('capture: uiautomator never reached an idle state');
}

const centreOf = (node) => {
  const m = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node);
  if (!m) return null;
  return {
    x: Math.round((+m[1] + +m[3]) / 2),
    y: Math.round((+m[2] + +m[4]) / 2),
  };
};

/** Wait for a node matching `pred` and return its centre. */
async function find(pred, what, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const node = (await dump()).find((n) => pred(n) && n.includes('bounds='));
    if (node) return centreOf(node);
    await delay(1000);
  }
  throw new Error(`capture: ${what} never appeared`);
}

const byId = (id) => (n) => n.includes(`resource-id="${id}"`);
const byText = (t) => (n) => n.includes(`text="${t}"`);

async function tap(pred, what) {
  const c = await find(pred, what);
  adb('shell', 'input', 'tap', String(c.x), String(c.y));
  await delay(900);
}

/**
 * Tap, then prove the tap LANDED — retrying if it did not.
 *
 * A node being in the view tree does not mean the app will accept a touch on it. `app/_layout.tsx`
 * wraps everything in a `<LoadingBoundary>` that mounts its children UNDERNEATH the launch loader
 * (that is what makes the crossfade possible), so uiautomator reports `office-login-button` while
 * the launch gate is still closed. The tap is swallowed, and the run then dies waiting for a
 * destination that was never opened — "Keycloak Sign In button never appeared" on a button that
 * works when pressed by hand a moment later.
 *
 * `freshApp()` used to paper over this with `delay(2500)`. That is a guess about how long a cold
 * start takes, and a cold-booted emulator takes longer than it. Verifying the outcome does not need
 * the guess and does not pay the wait when the app is already up.
 */
async function tapUntil(tapPred, expectPred, what, tries = 6) {
  for (let attempt = 0; attempt < tries; attempt++) {
    await tap(tapPred, what);
    await delay(1500);
    if ((await dump()).some(expectPred)) return;
  }
  throw new Error(`capture: ${what} never reached its destination after ${tries} taps`);
}

/** RN's LogBox notification ("Open debugger to view warnings.") — debug-only, keep it out of docs. */
async function dismissDevBanners() {
  for (let i = 0; i < 4; i++) {
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
 * on the root login route quits the app (it did: the run ended on the launcher). ESC is a no-op for
 * both the RN screen and the Custom Tab, so a wrong guess costs nothing.
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

/**
 * Type into the nth <input> of the Keycloak page, resolving its position immediately beforehand with
 * the keyboard down — the IME scrolls the page, so coordinates read earlier no longer hold.
 */
async function fillField(index, text, what) {
  await hideKeyboard();
  const fields = (await dump()).filter((n) => n.includes('class="android.widget.EditText"'));
  if (fields.length <= index) throw new Error(`capture: Keycloak ${what} field not found`);
  const c = centreOf(fields[index]);
  adb('shell', 'input', 'tap', String(c.x), String(c.y));
  await delay(700);
  await type(text);
  await hideKeyboard();
}

const KEYCLOAK_PORT = 8090;
const STALL_PROXY_PORT = 8099;

/**
 * Keycloak proxy that answers everything normally except the OIDC token endpoint, whose request it
 * accepts and then simply never replies to.
 *
 * 04-login-loading is the VerifyingOverlay, and login.tsx only raises oidcBusy for the duration of
 * exchangeCodeAsync — against a local Keycloak that is a couple hundred milliseconds, so the frame is
 * gone long before a screencap lands. Two simpler tricks failed: a fixed sleep before pulling the
 * port forward always lost the race (the app reached Home), and pulling the forward at all makes the
 * request fail *fast* (connection refused) rather than hang, which just flips oidcBusy back off via
 * the catch/finally. Stalling only /token leaves the whole sign-in genuine — Chrome's credential POST
 * and the discovery document still go through — and holds the app in the state being documented.
 */
function startStallProxy() {
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    if (req.url.includes('/protocol/openid-connect/token')) {
      req.resume(); // consume the body, answer nothing — the app sits in exchangeCodeAsync
      return;
    }
    const upstream = http.request(
      {
        host: '127.0.0.1',
        port: KEYCLOAK_PORT,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (up) => {
        res.writeHead(up.statusCode, up.headers);
        up.pipe(res);
      },
    );
    upstream.on('error', () => res.destroy());
    req.pipe(upstream);
  });
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  return {
    listen: () => new Promise((r) => server.listen(STALL_PROXY_PORT, '127.0.0.1', r)),
    close: () => {
      for (const s of sockets) s.destroy(); // the stalled /token socket is still open
      server.close();
    },
  };
}

/** Poll the focused window — far cheaper than a uiautomator dump, so it can be tight. */
async function waitForForeground(pkg, timeoutMs = 25_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const m = /mCurrentFocus=Window\{[^}]*\s([\w.]+)\//.exec(adb('shell', 'dumpsys', 'window'));
    if (m && m[1] === pkg) return;
    await delay(50);
  }
  throw new Error(`capture: ${pkg} never returned to the foreground after sign-in`);
}

function shot(name) {
  mkdirSync(OUT, { recursive: true });
  const png = execFileSync(ADB, [`exec-out`, 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(`${OUT}/${name}.png`, png);
  console.log(`  ✓ ${name}.png (${(png.length / 1024).toFixed(0)} KB)`);
}

/**
 * Dismiss a Chrome Custom Tab left over from a previous Path B run.
 *
 * Path B hands off to Keycloak in a Custom Tab, which belongs to CHROME, not to us. If a run dies
 * while it is open — and a run that dies is exactly when a re-run happens — it is still the resumed
 * activity on the next attempt. `pm clear` wipes OUR data and relaunches OUR app underneath it, so
 * the script then waits out its whole budget for a login screen that is mounted but covered, and
 * reports "office login button never appeared" on a build whose login screen is fine.
 *
 * BACK, not `am force-stop com.android.chrome`. force-stop kills Chrome's PROCESS but leaves its
 * TASK in recents, and Android resurrects that task the moment our own process goes away — measured
 * here: after force-stop the top activity was ours, and after the subsequent `pm clear` it was the
 * Custom Tab again. One BACK closes the tab and lands on our activity, which is what a person would
 * press and what the OS actually treats as dismissal.
 */
async function closeCustomTab(tries = 5) {
  for (let attempt = 0; attempt < tries; attempt++) {
    const top = adb('shell', 'dumpsys', 'activity', 'activities');
    const resumed = /topResumedActivity=\S+ \S+ (\S+)/.exec(top)?.[1] ?? '';
    if (!resumed.startsWith('com.android.chrome')) return;
    adb('shell', 'input', 'keyevent', '4');
    await delay(1500);
  }
  throw new Error('capture: a Chrome Custom Tab stayed in the foreground and would cover the app');
}

/** `pm clear` wipes app data (session + offline DB + stored locale) → deterministic login screen. */
async function freshApp() {
  // Close any Chrome Custom Tab first. Path B hands off to Keycloak in a Custom Tab, which is a
  // CHROME activity, not ours — `pm clear` wipes our data and leaves it sitting in the foreground.
  // The next `freshApp()` then relaunches the app UNDERNEATH it and waits for a login screen that is
  // on screen but covered, which is how this script failed with "office login button never appeared"
  // on a build whose login screen was fine. Only reachable when a previous run died mid-Path-B, which
  // is precisely when a re-run is being attempted.
  // AFTER `pm clear`, not before. Clearing our app kills our process, and Android then resumes the
  // next task in recents — Chrome's — so a tab dismissed first is simply back by the time the app
  // launches. Measured: dismiss-then-clear left the Custom Tab on top; clear-then-dismiss does not.
  adb('shell', 'pm', 'clear', PKG);
  await closeCustomTab();
  adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
  // 90 tries, not the default 20. `pm clear` drops the JS bundle cache with everything else, so this
  // is a genuine cold start: Metro re-serves the bundle and the app re-runs it before anything is on
  // screen. The default budget (~25-40s including dump time) is enough on a warm emulator and is not
  // enough on one that was just booted, which is exactly when a capture run tends to start.
  // `capture-android-transparency.mjs` sleeps a flat 30s here for the same reason.
  await find(byId('office-login-button'), 'login screen', 90);
  await delay(2500); // let the hero/card finish laying out
  await dismissDevBanners();
  // The docs set is English (so are the mockups). The login header's LanguageSwitcher is named for the
  // locale it switches TO, so 'locale-en' exists only while the app is showing Thai. On an en-US device
  // the app already comes up in English (the switcher reads 'locale-th') and there is nothing to do —
  // so tap 'locale-en' only when it is actually present, otherwise assume we are already English.
  try {
    const c = await find(byId('locale-en'), 'language switcher', 3);
    adb('shell', 'input', 'tap', String(c.x), String(c.y));
    await delay(1000);
  } catch {
    /* already English (switcher shows locale-th) — no switch needed */
  }
}

async function main() {
  for (const port of ['tcp:8081', 'tcp:3000', 'tcp:8090']) {
    adb('reverse', port, port); // Metro, backend, Keycloak — all reached as localhost on-device
  }

  console.log('01-login — landing');
  await freshApp();
  await dismissDevBanners();
  shot('01-login');

  console.log('02-login-otp-verify — passcode step');
  await tap(byId('country-picker'), 'country picker');
  await tap(byId('country-option-th'), 'Thailand option');
  await tap(byId('phone-input'), 'phone input');
  await type(OTP_PHONE);
  await hideKeyboard();
  await tap(byId('request-otp-button'), 'request OTP button');
  await find(byId('otp-input'), 'OTP input'); // proves the step actually rendered
  await hideKeyboard();
  await dismissDevBanners();
  shot('02-login-otp-verify');

  console.log('03-login-password — Keycloak hosted page');
  // Route the app's Keycloak traffic through the stall proxy for the rest of the run, so the token
  // exchange below hangs and 04's overlay stays on screen long enough to photograph.
  const proxy = startStallProxy();
  await proxy.listen();
  adb('reverse', `tcp:${KEYCLOAK_PORT}`, `tcp:${STALL_PROXY_PORT}`);
  try {
    await capturePathB();
  } finally {
    adb('reverse', `tcp:${KEYCLOAK_PORT}`, `tcp:${KEYCLOAK_PORT}`);
    proxy.close();
  }

  console.log(`\nDone — 4 screens in ${OUT}`);
}

async function capturePathB() {
  await freshApp();
  await dismissDevBanners();
  await tapUntil(byId('office-login-button'), byText('Sign In'), 'office login button');
  // Keycloak's page autofocuses the email field, so the IME covers half of it.
  await hideKeyboard();
  await delay(1000);
  shot('03-login-password');

  console.log('04-login-loading — token exchange');
  // Re-locate the fields before every tap, with the keyboard down. Raising the IME scrolls the page,
  // so coordinates read once go stale: doing it the other way put both strings in the email box
  // ("wichai.e@ekachai.co.thEkachai@2026") and Keycloak answered "Invalid username or password."
  await fillField(0, DEMO_EMAIL, 'email');
  await fillField(1, DEMO_PASSWORD, 'password');
  // Submit with ENTER from the password field rather than tapping Sign In: the button's coordinates
  // move as the IME opens and closes, and a tap read a moment earlier lands on the keyboard instead
  // (both fields ended up filled with the form never submitted). ENTER needs no coordinates.
  adb('shell', 'input', 'keyevent', '66'); // KEYCODE_ENTER

  // The redirect brings the app back; the stall proxy holds its token request open, so the overlay
  // stays up. waitForForeground proves the sign-in landed and the app — not the Custom Tab — is on
  // screen; with /token stalled the only thing it can be showing is the VerifyingOverlay.
  //
  // We cannot assert the overlay by testID here: it animates the gear, pulse ring and progress bar on
  // continuous RN Animated loops, so the window is never idle and `uiautomator dump` always returns a
  // null root (that is exactly what stalled earlier runs). Gate on the foreground instead, let the
  // animation settle a beat, and shoot the frame directly.
  await waitForForeground(PKG);
  await delay(1200);
  shot('04-login-loading');
}

main().catch((e) => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
