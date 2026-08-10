// Android SITE_WORKER screenshot capture — adb/uiautomator only, like every sibling script.
//
// Writes the role's screens to docs/screens/android/SITE-WORKER/, one folder per bottom-nav tab.
// The bar is Home | Tasks | Safety | Directory (PO 2026-08-09), so the tab folders are 01-Home,
// 02-Tasks, 03-Safety and 04-Directory, plus 05-Drawer for the navigation drawer — which is not a
// tab, and which IS the profile as of the same day (there is no profile route).
//
// Inside 01-Home the frames are numbered 01–04 and named for the mockup folders they implement:
//   01-dashboard      ← mockup 05_site_worker/01_home/01_sw_dashboard
//   02-quick-actions  ← …/01_home/02_sw_quick_actions   (opened by the Home FAB)
//   03-report-issue   ← …/01_home/03_sw_issue           (opened from that menu)
//   04-daily-report   ← …/01_home/04_sw_daily_report     (opened from that menu)
// The other tabs implement …/02_tasks/01_sw_daily_tasks, …/03_safety/01_sw_checklist and
// …/04_directory/01_sw_worker_list. All of those were renamed from
// {01_tasks,02_issues,03_reports,04_safety}/00_main in 527231f.
//
// ISSUES AND THE DAILY REPORT ARE FILED UNDER 01-Home/ because that is where they are reached from:
// both left the bar on 2026-08-09 and are now pushed from the Home FAB's quick-action menu. The
// README's rule is that a screen is filed under the tab it is reached from, which is also why
// 02-Tasks and 04-Directory are their own folders again — they became tabs in the same change.
//
// Signed in as Somsak Duangdee (+66811000010, seed-realistic.ts) — the seeded SITE_WORKER. Role
// matters: this bar belongs to SITE_WORKER alone (see lib/roleTabs.ts), so any other account
// renders a different one entirely.
//
// Shell is DARK — the product default for every role since 2026-08-04 (themeStore.ts).
//
// Prerequisites (all must already be running):
//   - emulator booted, debug app installed
//   - docker: postgres, pgbouncer, redis, keycloak, kafka, schema-registry
//   - migrations + prisma/seed.ts + prisma/seed-realistic.ts + prisma/provision-keycloak-demo.ts applied
//     (seed-realistic is what gives this worker its project memberships and the safety checklists —
//      without it every screen here renders an empty state)
//   - backend on :3000 with E2E_AUTH_BYPASS=true (fixes the OTP to OTP_CODE below)
//   - Metro: EXPO_PUBLIC_CAPTURE=1 EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1 npx expo start
// Run: node scripts/capture-android-site-worker.mjs

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../../docs/screens/android/SITE-WORKER');
const STITCH = join(HERE, 'stitch-fullpage.py');
const TMP = tmpdir();
const PKG = 'com.constructionos.cos';

const OTP_PHONE = process.env['E2E_OTP_PHONE'] ?? '0811000010';
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

/**
 * Pick the first project in <ProjectPicker />.
 *
 * The picker does NOT auto-select — every screen it appears on starts with no project chosen, which
 * is correct behaviour (choosing one for the worker would file a report against the wrong site) but
 * means the issue list, the checklist fetch and the report form all sit in their "nothing selected"
 * state until something taps a chip. Matched by testID PREFIX because the id is a seeded UUID.
 */
async function pickFirstProject() {
  const c = await find(
    (n) => /resource-id="project-option-[0-9a-f-]{36}"/.test(n),
    'a project chip',
  );
  adb('shell', 'input', 'tap', String(c.x), String(c.y));
  await delay(1500);
}

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

function grab(path) {
  const png = execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
  if (png.length < 20_000) throw new Error(`capture: ${path} screenshot looks empty`);
  writeFileSync(path, png);
}

/** Single top viewport — for a screen that fits one screenful. */
function grabOne(name) {
  const dest = join(OUT, `${name}.png`);
  mkdirSync(dirname(dest), { recursive: true });
  grab(dest);
  console.log(`  saved ${name}.png`);
}

/**
 * Rewind to the top, then shoot descending viewports and stitch ONE full-page PNG via
 * scripts/stitch-fullpage.py. `bot` sits just above whatever is pinned to the bottom of that screen so
 * it is appended once rather than repeated down the page — 2196 is the bottom-nav top edge on the
 * Medium_Phone AVD, which is the only fixed element on these screens (no FAB on this role's tabs).
 */
async function stitchFull(name, top, bot) {
  const dest = join(OUT, `${name}.png`);
  mkdirSync(dirname(dest), { recursive: true });
  for (let i = 0; i < 5; i++) {
    adb('shell', 'input', 'swipe', '540', '700', '540', '1700', '300');
    await delay(500);
  }
  await delay(700);
  const shots = [];
  for (let i = 0; i < 6; i++) {
    const p = join(TMP, `sw_${name.replace(/[^a-z0-9]/gi, '_')}_${i}.png`);
    grab(p);
    shots.push(p);
    if (i < 5) {
      adb('shell', 'input', 'swipe', '540', '1700', '540', '650', '500');
      await delay(1200);
    }
  }
  process.stdout.write(
    execFileSync('python', [STITCH, dest, String(top), String(bot), ...shots], {
      encoding: 'utf-8',
    }),
  );
  console.log(`  stitched ${name}.png`);
}

// The bottom-nav top edge on this AVD. Everything on these four tabs scrolls under it.
const NAV_TOP = 2196;

/**
 * Which frames to capture. `--only <substring>` (repeatable) narrows the run to the screens whose
 * name contains it, so a one-screen change costs one screen's worth of time instead of eight
 * (PO request 2026-08-09). With no flag every frame is captured, which is what CI and a full
 * refresh want.
 *
 * The login and app-shell steps always run: every frame is taken from one signed-in session.
 */
const ONLY = process.argv.slice(2).flatMap((a, i, all) => (a === '--only' ? [all[i + 1]] : []));
const wanted = (name) => ONLY.length === 0 || ONLY.some((o) => name.includes(o));

async function main() {
  if (ONLY.length > 0) console.log(`· --only ${ONLY.join(', ')}`);
  mkdirSync(OUT, { recursive: true });
  for (const p of ['tcp:8081', 'tcp:3000', 'tcp:8090']) adb('reverse', p, p);

  adb('shell', 'am', 'force-stop', PKG);
  adb('shell', 'pm', 'clear', PKG);
  // The Issues screen is camera-FIRST (the mockup opens on a viewfinder). `pm clear` wipes granted
  // permissions along with the data, so without this the screen renders its "enable camera" prompt
  // and the capture documents a permission dialog instead of the feature. Granting it here keeps the
  // run self-contained — the alternative is a hand-tapped system dialog that uiautomator has to race.
  adb('shell', 'pm', 'grant', PKG, 'android.permission.CAMERA');
  adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
  console.log('· app launched, waiting for the JS bundle');
  await delay(30_000);
  await dismissDevBanners();

  console.log(`· Path A login as ${OTP_PHONE} (SITE_WORKER)`);
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

  // WHICH SITE — the first screen this role now sees (mockup
  // 05_site_worker/01_home/00_sw_project_selection, added 2026-08-10). The shell routes a Site
  // Worker here whenever no site is chosen, and `pm clear` above guarantees that on every run, so
  // this is not a screen the script has to navigate to: it is where the app already is.
  await find(byId('select-project-screen'), 'project picker', 40);
  await dismissDevBanners();
  await delay(1200);
  if (wanted('01-Home/00-select-project')) {
    console.log('· 01-Home/00-select-project');
    await stitchFull('01-Home/00-select-project', 180, NAV_TOP);
  }
  // Choosing one is what unlocks every screen below — they all print the site they belong to.
  console.log('· choosing the active site');
  await tap((n) => n.includes('text="The Sukhumvit 45 Residences"'), 'Sukhumvit 45 card');
  await find(byId('home-screen'), 'home after choosing', 40);
  await dismissDevBanners();

  // Home — the role's landing tab since 2026-08-08: KPI cards, the project picker + check-in, and
  // the quick actions. Asserted on the check-in button rather than just the screen, because that
  // control is the reason Home is a tab at all for this role.
  if (wanted('01-Home/01-dashboard')) {
    console.log('· 01-Home/01-dashboard');
    await tap(byId('home-tab'), 'home tab');
    await find(byId('home-screen'), 'home-screen');
    // CHECK IN moved to the navigation drawer on 2026-08-09, so it is asserted there, not here.
    // The two bento tiles the rework put on this screen. Asserted so a regression that drops them
    // fails the run rather than committing a screenshot of the old KPI cards.
    await find(byId('stat-my-tasks'), 'My Tasks stat tile');
    await find(byId('stat-shift-hours'), 'Shift Hours stat tile');
    await dismissDevBanners();
    await delay(1200);
    // Taller than a viewport since the rework (tiles + AI insight + check-in + three task cards).
    await stitchFull('01-Home/01-dashboard', 180, NAV_TOP);
    // Tasks — pushed from Home's quick action, so it carries a breadcrumb (HOME › TASKS) and a back
    // chevron like every other child screen. Delta sync has to land first or the list is legitimately
    // empty, so at least one card is asserted BEFORE the shot: an empty Tasks screen is a valid app
    // state but a useless screenshot, and it must fail the run rather than be committed.
  }

  if (wanted('02-Tasks/01-tasks')) {
    console.log('· 02-Tasks/01-tasks');
    await tap(byId('tasks-tab'), 'tasks tab');
    await find(byId('tasks-screen'), 'tasks-screen');
    await find((n) => /resource-id="task-[0-9a-f-]{36}"/.test(n), 'at least one task card', 40);
    await dismissDevBanners();
    await delay(1200);
    grabOne('02-Tasks/01-tasks');
    // Issues — camera-first, so it is taller than a viewport (viewfinder + 4 category chips + voice +
    // description + submit + the synced list). Stitched.
  }

  if (wanted('01-Home/03-report-issue')) {
    console.log('· 01-Home/03-report-issue');
    await tap(byId('home-tab'), 'home tab');
    await tap(byId('home-quick-action-fab'), 'quick action FAB');
    await tap(byId('quick-action-reportIssue'), 'report-issue card');
    await find(byId('issues-screen'), 'issues-screen');
    await pickFirstProject();
    await find(byId('issue-type-DEFECT'), 'issue category chips');
    await dismissDevBanners();
    await delay(1500);
    await stitchFull('01-Home/03-report-issue', 180, NAV_TOP);
    // Daily report — the longest screen in the set (manpower + shift + per-trade bars + summary +
    // blockers + photos + the two actions).
  }

  if (wanted('01-Home/04-daily-report')) {
    console.log('· 01-Home/04-daily-report');
    await tap(byId('home-tab'), 'home tab');
    await tap(byId('home-quick-action-fab'), 'quick action FAB');
    await tap(byId('quick-action-logActivity'), 'log-activity card');
    await find(byId('report-screen'), 'report-screen');
    await pickFirstProject();
    await find(byId('manpower-total'), 'manpower stepper');
    await dismissDevBanners();
    await delay(1500);
    await stitchFull('01-Home/04-daily-report', 180, NAV_TOP);
    // Safety checklist. Asserted on a real checklist ITEM, not just the screen: with no checklists
    // seeded the screen renders its honest empty state, and that must fail the run instead of being
    // committed as though it were the feature.
  }

  if (wanted('03-Safety/01-safety-checklist')) {
    console.log('· 03-Safety/01-safety-checklist');
    await tap(byId('safety-checklist-tab'), 'safety tab');
    await find(byId('safety-checklist-screen'), 'safety-checklist-screen');
    await pickFirstProject(); // nothing is fetched until a project is chosen (see the screen's comment)
    await find((n) => /resource-id="safety-item-/.test(n), 'at least one checklist item', 40);
    await dismissDevBanners();
    await delay(1500);
    await stitchFull('03-Safety/01-safety-checklist', 180, NAV_TOP);
    // Quick actions — the FAB menu (mockup 01_home/02_sw_quick_actions). Three cards, each routing to a
    // screen that already exists.
  }

  if (wanted('01-Home/02-quick-actions')) {
    console.log('· 01-Home/02-quick-actions');
    await tap(byId('home-tab'), 'home tab');
    await find(byId('home-quick-action-fab'), 'quick action FAB');
    await tap(byId('home-quick-action-fab'), 'quick action FAB');
    await find(byId('quick-actions-screen'), 'quick-actions-screen');
    await find(byId('quick-action-reportIssue'), 'report-issue card');
    await dismissDevBanners();
    await delay(1200);
    grabOne('01-Home/02-quick-actions');
    // CLOSE IT. This step is the only one that leaves a MODAL on screen, and the sheet covers the
    // bottom bar — the Directory step below then looked for a tab that was behind it and failed the
    // whole run with "directory tab never appeared". A step that opens an overlay owns closing it.
    await tap(byId('quick-actions-close'), 'quick-actions close');
    await find(byId('home-screen'), 'home after closing the quick actions');
    // Team directory (mockup 04_directory). Opened from the navigation drawer, and asserted on a real
    // CARD: with no crew allocated the screen renders its honest empty state, which must fail the run
    // rather than be committed as though it were the feature.
  }

  if (wanted('04-Directory/01-directory')) {
    console.log('· 04-Directory/01-directory');
    await tap(byId('directory-tab'), 'directory tab');
    await find(byId('directory-screen'), 'directory-screen');
    await pickFirstProject(); // nothing is fetched until a project is chosen
    await find((n) => /resource-id="directory-card-/.test(n), 'at least one crew card', 40);
    await dismissDevBanners();
    await delay(1500);
    await stitchFull('04-Directory/01-directory', 180, NAV_TOP);
    // THE DRAWER IS THE PROFILE (PO 2026-08-09): there is no `/profile` route, and every account
    // control renders inside this panel. Opened from the top-bar avatar, which is what the avatar
    // does now instead of pushing a screen. Asserted on the account block as well as the panel, so a
    // regression that drops <AccountSettings /> fails the run rather than saving a bare menu.
  }

  if (wanted('05-Drawer/01-drawer-profile')) {
    console.log('· 05-Drawer/01-drawer-profile');
    await tap(byId('profile-avatar'), 'avatar');
    await find(byId('drawer-profile-card'), 'drawer profile card');
    await find(byId('drawer-link-/account-settings'), 'settings row');
    await dismissDevBanners();
    await delay(1200);
    await stitchFull('05-Drawer/01-drawer-profile', 180, NAV_TOP);
    // CLOSE IT, for the same reason the quick-actions sheet is closed above: the drawer is left
    // open otherwise, and the next step's tap on the avatar lands on the drawer's BACKDROP — which
    // closes the panel instead of opening it, so the Settings row it then looks for is genuinely
    // gone. Hardware BACK is what the panel itself listens for.
    adb('shell', 'input', 'keyevent', '4');
    await find(byId('directory-screen'), 'the screen behind the drawer');
    // Account settings — pushed from the drawer's Settings row (mockup 05_profile). Its own screen
    // since 2026-08-09: inline in the drawer, these sections put ~900px of a 2400px panel below the
    // fold and mixed navigation with settings.
  }

  if (wanted('05-Drawer/02-account-settings')) {
    console.log('· 05-Drawer/02-account-settings');
    // Opens the drawer itself rather than inheriting it from the frame above — every step has to
    // stand alone now that `--only` can run any one of them by itself.
    await tap(byId('profile-avatar'), 'avatar');
    await tap(byId('drawer-link-/account-settings'), 'settings drawer row');
    await find(byId('account-settings-screen'), 'account-settings-screen');
    await find(byId('locale-row'), 'language row');
    await dismissDevBanners();
    await delay(1200);
    await stitchFull('05-Drawer/02-account-settings', 180, NAV_TOP);
  }

  console.log(`\nDone → ${OUT}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
