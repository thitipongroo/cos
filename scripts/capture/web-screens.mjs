// Web screen-capture: logs into the web app (apps/web) via Keycloak Path B as the e2e-admin
// (TENANT_ADMIN — widest page access) against the local backend + seeded DEMO-001 data, then
// screenshots each route straight to docs/screens/web/. Documentation generator, not a test.
//
// Prereqs: full docker stack + backend :3000 (E2E_AUTH_BYPASS) + web :3001 + seed-e2e-users.sh run.
// Run: node scripts/capture/web-screens.mjs   (from repo root)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(ROOT, 'docs/screens/web');
const BASE = process.env.WEB_BASE_URL ?? 'http://localhost:3001';
const EMAIL = 'e2e-admin@construction-os.io';
const PASSWORD = 'E2eTestPass123!';
const KEYCLOAK_URL = /\/realms\//;

// number | route | filename — numbered by flow so they line up with the mobile set where they correspond.
const ROUTES = [
  ['01', '/projects', 'projects'],
  ['02', '/portfolio', 'portfolio'],
  ['03', '/tasks', 'tasks'],
  ['04', '/analytics/executive', 'dashboard'],
  ['05', '/procurement/requests', 'procurement-requests'],
  ['06', '/procurement/rfqs', 'rfqs'],
  ['07', '/procurement/orders', 'orders'],
  ['08', '/procurement/deliveries', 'deliveries'],
  ['09', '/procurement/vendors', 'vendors'],
  ['10', '/finance/budget', 'budget'],
  ['11', '/finance/invoices', 'invoices'],
  ['12', '/finance/payments', 'payments'],
  ['13', '/finance/reports/variance', 'variance'],
  ['14', '/site/reports', 'site-reports'],
  ['15', '/site/issues', 'issues'],
  ['16', '/site/inspections', 'inspections'],
  ['17', '/site/conflicts', 'conflicts'],
  ['18', '/safety/incidents', 'incidents'],
  ['19', '/alerts', 'alerts'],
  ['20', '/reports', 'reports'],
  ['21', '/crm/leads', 'crm-leads'],
  ['22', '/settings/users', 'settings-users'],
  ['23', '/settings/profile', 'profile'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Capture the login page first (pre-auth). NOTE: the app polls continuously (SSE notification
  // bell + React Query), so the network never goes idle — 'networkidle' would always time out
  // (same reason the mobile capture uses disableSynchronization). Use 'domcontentloaded' + a settle
  // delay instead.
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/00-login.png` });
  console.log('captured 00-login');

  // Log in via Keycloak Path B (mirrors tests/e2e/helpers/auth.ts).
  await page.getByRole('button').first().click();
  await page.locator('#username').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('#kc-login').click();
  await page.waitForURL((url) => !KEYCLOAK_URL.test(url.href) && !url.pathname.startsWith('/login'), {
    timeout: 30_000,
  });
  console.log('logged in as', EMAIL);

  let ok = 0;
  for (const [num, route, name] of ROUTES) {
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(2500); // let client-side data/charts settle (app never reaches network idle)
      await page.screenshot({ path: `${OUT}/${num}-${name}.png` });
      ok++;
      console.log(`captured ${num}-${name}`);
    } catch (e) {
      console.log(`FAILED ${num}-${name}: ${String(e).split('\n')[0]}`);
    }
  }
  await browser.close();
  console.log(`Done: ${ok}/${ROUTES.length} routes + login captured to docs/screens/web/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
