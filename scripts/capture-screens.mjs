// Per-role web screenshot harness. Logs into the running web app (http://localhost:3001) as each
// role's demo user via the Keycloak hosted login (Path B), then screenshots every route that role
// can reach (from apps/web/src/lib/nav.ts) into docs/screens/web/<ROLE>/, where <ROLE> is the
// canonical CosRole spelling in UPPER_SNAKE (TENANT_ADMIN). This deliberately DIFFERS from
// docs/screens/android/, which uses UPPER-KEBAB (TENANT-ADMIN): the web tree was committed as
// UPPER_SNAKE and that is the convention it keeps (product-owner decision 2026-08-07).
// Pre-auth screens go to docs/screens/web/01-public/.
//
// Prereqs: web on :3001, backend on :3000, Keycloak on :8090, demo users provisioned
// (password Ekachai@2026). Run: node scripts/capture-screens.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.WEB_BASE || 'http://localhost:3001';
const PW = process.env.DEMO_USER_PASSWORD || 'Ekachai@2026';
const OUT = path.resolve(__dirname, '../docs/screens/web');

// Role keys below are the canonical CosRole spelling (UPPER_SNAKE) and are used verbatim as the
// folder name — no conversion. A folderFor() helper used to kebab-case them, which wrote
// PROJECT-MANAGER/ beside the committed PROJECT_MANAGER/; removed 2026-08-07.

// role → { email, routes } (routes = nav.ts NAV_BY_ROLE + landing/extra surfaces).
const PROC = ['/procurement/requests', '/procurement/rfqs', '/procurement/quotations', '/procurement/orders', '/procurement/deliveries', '/procurement/vendors'];
const FIN = ['/finance/payments', '/finance/budget', '/finance/invoices', '/finance/reports/variance'];
const SE = ['/site/reports', '/site/issues', '/site/inspections', '/site/conflicts'];
const CRM = ['/crm/leads', '/crm/opportunities', '/crm/customers'];

const ROLES = {
  EXECUTIVE: { email: 'wichai.e@ekachai.co.th', routes: ['/', '/portfolio', '/alerts', '/reports'] },
  TENANT_ADMIN: { email: 'suphaporn.r@ekachai.co.th', routes: ['/settings/users', '/settings/tenant', '/settings/profile', '/projects', ...PROC, ...FIN, ...SE] },
  PROJECT_MANAGER: { email: 'thanawat.b@ekachai.co.th', routes: ['/projects'] },
  PROCUREMENT_OFFICER: { email: 'nattapong.w@ekachai.co.th', routes: PROC },
  PROC_MANAGER: { email: 'rungnapa.c@ekachai.co.th', routes: PROC },
  FINANCE: { email: 'pimchanok.t@ekachai.co.th', routes: FIN },
  SITE_ENGINEER: { email: 'adisorn.m@ekachai.co.th', routes: SE },
  SAFETY_OFFICER: { email: 'decha.p@ekachai.co.th', routes: ['/safety/incidents', '/safety/permits', '/safety/checklists', '/safety/compliance'] },
  SITE_WORKER: { email: 'somsak.d@ekachai.co.th', routes: ['/tasks', '/site/reports/new', '/site/issues/new', '/site/checklists'] },
  CRM_SALES_MANAGER: { email: 'chalermsak.n@ekachai.co.th', routes: CRM },
};

const fileFor = (route) => (route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '_')) + '.png';

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByRole('button').first().click();
  await page.locator('#username').fill(email, { timeout: 30000 });
  await page.locator('#password').fill(PW);
  await page.locator('#kc-login').click();
  await page.waitForURL((u) => !/\/realms\//.test(u.href) && !u.pathname.startsWith('/login'), { timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
}

async function shot(page, route, dir) {
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(dir, fileFor(route)), fullPage: true });
    return true;
  } catch (e) {
    console.log(`  ! ${route}: ${String(e).split('\n')[0]}`);
    return false;
  }
}

(async () => {
  const browser = await chromium.launch();
  // Public auth screens (captured once).
  const pubDir = path.join(OUT, '01-public');
  fs.mkdirSync(pubDir, { recursive: true });
  const pub = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pp = await pub.newPage();
  for (const r of ['/login', '/login/otp']) await shot(pp, r, pubDir);
  await pub.close();

  let total = 0;
  for (const [role, cfg] of Object.entries(ROLES)) {
    const dir = path.join(OUT, role);
    fs.mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    try {
      await login(page, cfg.email);
      let ok = 0;
      for (const route of cfg.routes) if (await shot(page, route, dir)) ok++;
      console.log(`${role}: ${ok}/${cfg.routes.length} screens`);
      total += ok;
    } catch (e) {
      console.log(`${role}: LOGIN FAILED — ${String(e).split('\n')[0]}`);
    }
    await ctx.close();
  }
  await browser.close();
  console.log(`DONE — ${total} screenshots under docs/screens/web/`);
})();
