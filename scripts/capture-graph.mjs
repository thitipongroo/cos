// Screenshot the new project Knowledge-Graph tab (Phase 13 graph APIs) as the PM demo user.
// Captures the tab at load, then after clicking a vendor's "View relationships" drill-down.
// Run: node scripts/capture-graph.mjs
import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE = process.env.WEB_BASE || 'http://localhost:3001';
const PW = process.env.DEMO_USER_PASSWORD || 'Ekachai@2026';
const EMAIL = 'thanawat.b@ekachai.co.th'; // PROJECT_MANAGER
const PID = process.env.PID || '88803908-e4b5-57bd-8e6b-ed4662b5d67d';
const OUT = path.resolve(__dirname, '../docs/screens/web/PROJECT_MANAGER');

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByRole('button').first().click();
  await page.locator('#username').fill(email, { timeout: 30000 });
  await page.locator('#password').fill(PW);
  await page.locator('#kc-login').click();
  await page.waitForURL((u) => !/\/realms\//.test(u.href) && !u.pathname.startsWith('/login'), { timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await login(page, EMAIL);
    console.log('logged in as', EMAIL);

    await page.goto(`${BASE}/projects/${PID}/graph`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, 'projects_graph.png'), fullPage: true });
    console.log('shot: projects_graph.png');

    // Drill into the first vendor to load shared projects + invoices.
    const btn = page.getByRole('button', { name: /ดูความสัมพันธ์|View relationships/ }).first();
    if (await btn.count()) {
      await btn.click();
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(OUT, 'projects_graph_vendor.png'), fullPage: true });
      console.log('shot: projects_graph_vendor.png');
    } else {
      console.log('! no vendor drill-down button found');
    }
  } catch (e) {
    console.log('ERROR', String(e).split('\n')[0]);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
