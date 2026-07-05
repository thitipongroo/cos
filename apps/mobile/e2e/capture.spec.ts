// Screenshot-capture E2E: logs in once (Path A phone+OTP against the local backend with
// E2E_AUTH_BYPASS=true, fixed OTP 123456), then deep-links each app route and captures the
// booted-simulator screen straight to docs/screens/ios/. Not a functional test — a documentation
// generator. Run explicitly: `detox test -c ios.sim.release e2e/capture.spec.ts`.
import { by, device, element } from 'detox';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = resolve(__dirname, '../../../docs/screens/ios');
const PHONE = '+66800000002'; // PROJECT_MANAGER (set via Keycloak) — sees the widest data set
const OTP = '123456';
// Seeded project in the PM user's tenant; project-scoped screens use a picker (no auto-select),
// so we tap this chip to load its KPIs/budget/analytics.
const PROJECT_ID = 'b0000000-0000-4000-8000-000000000001';

// Ordered for a coherent walkthrough: entry → overview → delivery/finance → site → account.
const ROUTES = [
  'home',
  'dashboard',
  'projects',
  'tasks',
  'portfolio',
  'budget',
  'invoices',
  'payments',
  'procurement',
  'rfqs',
  'orders',
  'deliveries',
  'issues',
  'incidents',
  'inspections',
  'reports',
  'report',
  'alerts',
  'conflict-review',
  'profile',
];

function shot(name: string): void {
  execSync(`xcrun simctl io booted screenshot "${OUT}/${name}.png"`, { stdio: 'ignore' });
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('mobile screen capture', () => {
  beforeAll(async () => {
    mkdirSync(OUT, { recursive: true });
    // `delete: true` wipes the app container (offline DB) so we start from a clean slate on the login
    // screen — no reset deep-link / reloadReactNative needed (the reload path can crash the RN bridge).
    await device.launchApp({ newInstance: true, delete: true });
    // The app polls data continuously → it never reaches Detox's "idle" state, so ANY waitFor/sync
    // hangs on "app is busy". Drive the entire suite sync-free with fixed delays + screenshots.
    await device.disableSynchronization();
  });

  it('logs in and lands on home', async () => {
    await delay(6000); // login screen render
    shot('00-login');
    await element(by.id('phone-input')).tap();
    await element(by.id('phone-input')).replaceText(PHONE);
    await delay(1500); // onChangeText → button un-disables
    await element(by.id('request-otp-button')).tap();
    await delay(6000); // OTP round-trip + step render
    await element(by.id('otp-input')).tap();
    await element(by.id('otp-input')).replaceText(OTP);
    await delay(1000);
    await element(by.id('verify-otp-button')).tap();
    await delay(8000); // verify + token decode + AuthGate redirect + first data fetch
  });

  it('captures every app route', async () => {
    // Prime the offline project cache first: the Projects screen runs refreshProjectsCache()
    // (GET /projects → local_projects), so every later ProjectPicker shows the project chip.
    await device.openURL({ url: 'cos:///projects' });
    await delay(4000);

    let i = 1;
    for (const route of ROUTES) {
      await device.openURL({ url: `cos:///${route}` });
      await delay(2500); // navigation + picker cache refresh
      // Project-scoped screens gate their data behind picking a project. Tap the chip if present
      // (no-op on screens without a picker); then let the KPIs/budget/analytics load.
      try {
        await element(by.id(`project-option-${PROJECT_ID}`))
          .atIndex(0)
          .tap();
        await delay(2500);
      } catch {
        /* screen has no project picker — capture as-is */
      }
      shot(`${String(i).padStart(2, '0')}-${route}`);
      i += 1;
    }
  }, 420000); // 20 routes × (nav + picker tap + settle) exceeds the 120s default
});
