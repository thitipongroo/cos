// Interaction-level screenshots: drill-down detail pages, create forms, and the notification
// popover (the app's real in-page interactions — it uses dedicated /new form pages + detail
// routes rather than modals). Saves to docs/screens/web/<ROLE>/_interactions/.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.WEB_BASE || 'http://localhost:3001';
const PW = process.env.DEMO_USER_PASSWORD || 'Ekachai@2026';
const OUT = path.resolve(__dirname, '../docs/screens/web');
const SKV45 = '88803908-e4b5-57bd-8e6b-ed4662b5d67d'; // The Sukhumvit 45 Residences (EKC)

const USERS = {
  EXECUTIVE: 'wichai.e@ekachai.co.th',
  TENANT_ADMIN: 'suphaporn.r@ekachai.co.th',
  PROJECT_MANAGER: 'thanawat.b@ekachai.co.th',
  PROCUREMENT_OFFICER: 'nattapong.w@ekachai.co.th',
  FINANCE: 'pimchanok.t@ekachai.co.th',
  SITE_ENGINEER: 'adisorn.m@ekachai.co.th',
  SITE_WORKER: 'somsak.d@ekachai.co.th',
};

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByRole('button').first().click();
  await page.locator('#username').fill(email, { timeout: 30000 });
  await page.locator('#password').fill(PW);
  await page.locator('#kc-login').click();
  await page.waitForURL((u) => !/\/realms\//.test(u.href) && !u.pathname.startsWith('/login'), { timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
}

async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1000);
}
async function shot(page, dir, name) {
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
}

async function doInteractions(page, role, dir) {
  const captured = [];
  // 1. Detail drill-down (click a project row → detail, then sub-tabs).
  if (role === 'PROJECT_MANAGER' || role === 'TENANT_ADMIN') {
    await page.goto(`${BASE}/projects`, { waitUntil: 'domcontentloaded' });
    await settle(page);
    const link = page.locator('a[href*="/projects/"]').first();
    if (await link.count()) {
      await link.click().catch(() => {});
      await settle(page);
      await shot(page, dir, '01-project-detail-drilldown'); captured.push('project-detail');
    }
    for (const [i, tab] of ['site', 'finance', 'procurement'].entries()) {
      await page.goto(`${BASE}/projects/${SKV45}/${tab}`, { waitUntil: 'domcontentloaded' });
      await settle(page);
      await shot(page, dir, `0${i + 2}-project-${tab}-tab`); captured.push(`project-${tab}`);
    }
  }
  // 2. Notification popover (open the bell dropdown — the app's one real popover).
  const bell = page.getByRole('button', { name: /แจ้งเตือน|notification/i });
  if (await bell.count()) {
    await bell.first().click().catch(() => {});
    await page.waitForTimeout(900);
    await shot(page, dir, '10-notifications-popover'); captured.push('notifications');
  }
  // 3. Create forms (the app's create interaction = dedicated /new pages).
  const forms = {
    PROCUREMENT_OFFICER: [['/procurement/deliveries/new', '20-delivery-create-form']],
    SITE_WORKER: [['/site/reports/new', '20-daily-report-form'], ['/site/issues/new', '21-issue-report-form']],
    SITE_ENGINEER: [['/site/issues/new', '20-issue-report-form']],
  }[role] || [];
  for (const [route, name] of forms) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
    await settle(page);
    await shot(page, dir, name); captured.push(name);
  }
  return captured;
}

(async () => {
  const browser = await chromium.launch();
  let total = 0;
  for (const [role, email] of Object.entries(USERS)) {
    const dir = path.join(OUT, role, '_interactions');
    fs.mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    try {
      await login(page, email);
      const got = await doInteractions(page, role, dir);
      console.log(`${role}: ${got.length} interactions [${got.join(', ')}]`);
      total += got.length;
    } catch (e) {
      console.log(`${role}: FAILED — ${String(e).split('\n')[0]}`);
    }
    await ctx.close();
  }
  await browser.close();
  console.log(`DONE — ${total} interaction screenshots`);
})();
