// Web capture — the SYSTEM_ADMIN panel (§20.4), into docs/screens/web/SYSTEM_ADMIN/. Documentation generator, not a
// test.
//
// Produces:
//   02-create-tenant.png        the Create Tenant modal over /admin (R13), opened by the list's button, FILLED IN, before
//                               submit; the viewport is made tall enough for the modal's form not to scroll
//   01-tenant-list.png          /admin in its §20.4.2 success state for that tenant; since R13 only the workspace scrolls,
//                               so the viewport is made as tall as the workspace's content and the whole list is in frame
//   R17 (2026-09-15) — each modal FILLED IN and NOT submitted, each page after the data below exists:
//   03-mark-contracted.png      Mark Tenant as Enterprise Contracted, over the list, for FRESH
//   04-assign-dedicated-db.png  Assign Dedicated Database, gates ticked and URI typed, for FRESH
//   05-tenant-audit-log.png     Tenant Audit Log for siam_infra_eng
//   06-tenant-detail.png        Tenant Detail & Provisioning Console for siam_infra_eng (run at the gate)
//   07-deactivate-tenant.png    Deactivate Tenant for apex_construct_th, code and justification typed
//   08-cluster.png              /admin/cluster
//   09-db-fleet.png             /admin/db-fleet
//   10-data-migrations.png      /admin/migrations
//   11-global-audit-log.png     /admin/audit
//   12-central-prices.png       /admin/central-prices after one failed and one successful import and one sync
//   13-system-settings.png      /admin/settings after one save
//
// ── THE DATA IS WRITTEN THROUGH THE PANEL ITSELF (revision R1, R4) ─────────────────────────────
// The list needs more than the one seeded tenant to show what the page does, so before shooting, this
// script CREATES the tenants below through the real Create Tenant form and DEACTIVATES one through the
// real row action — each with a justification, so each is audited. Nothing is inserted behind the
// panel's back. A re-run finds the codes taken (409), the tenant already inactive, runs already started
// and hosts already assigned, and moves on. Since R17 the row actions are modals (type-the-code, the
// §20.4.3 gates, justification); this script drives them the way an operator does.
//
// ── THE PROVISIONING STATES (revision R11, product-owner decisions 2026-09-15) ────────────────────────
// The drawing's rows carry a dedicated host, a run at the migration gate and a run in progress. They are
// produced through the panel too:
//   bkk_metro_corp      Mark as Contracted → run reaches the gate → Approve → "Ready" → Assign DB db-ent-042
//   siam_infra_eng      Mark as Contracted → parked at the gate: banner, Transit, Waiting, gavel
//   cpac_precast_group  Assign DB db-ent-039, no run → Active
//   <HELD_CODE>         Mark as Contracted → held in CREATING_RDS: Pending, "Creating database"
// A run needs a worker. Locally that is backend/test/dev/provisioning-stub-worker.ts — the REAL workflow
// with stub activities, so no AWS call is made — started with COS_DEV_STUB_HOLD=<HELD_CODE>. The two
// assigned hosts do not exist: those dev tenants' own queries would route nowhere (accepted, decision 2).
// NOT PRODUCIBLE: the drawing's "Provisioning…" row is a STARTER tenant, but the workflow runs for
// ENTERPRISE only; the held row is ENTERPRISE. A run at the gate has no host written, so siam_infra_eng's
// routing cell reads pooled where the drawing shows "→ db-ent-043".
//
// ── R17 DEV DATA, ALSO THROUGH THE PANEL ───────────────────────────────────────────────────────────
//   FRESH (thai_rail_infra)  an ENTERPRISE tenant with no run and no host, so Mark as Contracted and Assign DB both
//                            open with every prerequisite met; neither is submitted.
//   Central prices           the drawing's five items, imported from a CSV through Import Central Prices, after a
//                            file with the wrong columns (a real FAILED run), then one Force Retry Sync (the e-GP
//                            adapter is a stub, so it records NOT_CONFIGURED — decision D9). Pending rows are not
//                            producible: an import publishes what it writes (ADR-061 amendment).
//   System settings          the drawing's values typed into the form and saved once with a justification. They are
//                            operator input for the frame; nothing reads them (ADR-108).
//
// Prereqs: docker stack up · migrations applied · backend on :3000 · web on :3001 started with the root .env loaded
// (`set -a; . ../../.env; set +a; npx next dev -p 3001`) · seed-realistic.ts loaded ·
// `bash scripts/dev/seed-dev-system-admin.sh` · the stub worker, from backend/:
//   set -a; . ../.env; set +a; COS_DEV_STUB_HOLD=lanna_steel_works npx ts-node test/dev/provisioning-stub-worker.ts
// Run: node scripts/capture/web-system-admin.mjs   (from repo root)

import { chromium } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(ROOT, 'docs/screens/web/SYSTEM_ADMIN');
const BASE = process.env.WEB_BASE_URL ?? 'http://localhost:3001';
const EMAIL = process.env.COS_DEV_SYSADMIN_EMAIL ?? 'sysadmin@construction-os.dev';
const PASSWORD = process.env.COS_DEV_SYSADMIN_PASSWORD ?? 'SysAdminDev@2026';
const KEYCLOAK_URL = /\/realms\//;

/** Codes from the drawing's own rows; the names are this script's. */
const TENANTS = [
  {
    code: 'bkk_metro_corp',
    name: 'Bangkok Metro Corporation',
    plan: 'ENTERPRISE',
    justification: 'Enterprise onboarding approved by sales — ticket OPS-4390.',
  },
  {
    code: 'siam_infra_eng',
    name: 'Siam Infrastructure Engineering Co., Ltd.',
    plan: 'ENTERPRISE',
    justification: 'Enterprise contract signed 2026-09-12 — onboarding ticket OPS-4412.',
  },
  {
    code: 'apex_construct_th',
    name: 'Apex Construction Thailand',
    plan: 'PROFESSIONAL',
    justification: 'Professional plan purchase confirmed — ticket OPS-4415.',
  },
  {
    code: 'northeastern_build',
    name: 'Northeastern Build Co.',
    plan: 'STARTER',
    justification: 'Starter trial requested by the customer — ticket OPS-4421.',
  },
  {
    code: 'cpac_precast_group',
    name: 'CPAC Precast Group',
    plan: 'ENTERPRISE',
    justification: 'Enterprise contract for precast operations — ticket OPS-4433.',
  },
  {
    code: process.env.HELD_CODE ?? 'lanna_steel_works',
    name: 'Lanna Steel Works Co., Ltd.',
    plan: 'ENTERPRISE',
    justification: 'Enterprise contract signed for northern region plants — ticket OPS-4440.',
  },
  {
    code: 'thai_rail_infra',
    name: 'Thai Rail Infrastructure PCL',
    plan: 'ENTERPRISE',
    justification: 'Enterprise onboarding for the rail programme — ticket OPS-4460.',
  },
];
const HELD = TENANTS[5];
const FRESH = TENANTS[6];
const CONTRACT = (code) => ({
  code,
  reference: `CT-2026-${code.slice(0, 4).toUpperCase()}`,
  justification: `Contract countersigned; dedicated DB provisioning requested for ${code} — ticket OPS-4450.`,
});
const ASSIGN = [
  {
    code: 'bkk_metro_corp',
    url: 'postgresql://db_admin:dev-placeholder@db-ent-042.cos.internal:5432/bkk_metro_prod',
    justification: 'Route bkk_metro_corp to its provisioned dedicated instance — ticket OPS-4451.',
  },
  {
    code: 'cpac_precast_group',
    url: 'postgresql://db_admin:dev-placeholder@db-ent-039.cos.internal:5432/cpac_precast_prod',
    justification: 'Route cpac_precast_group to its dedicated instance — ticket OPS-4452.',
  },
];
const APPROVE_JUSTIFICATION =
  'Dedicated instance verified by DBA on-call; data migration may proceed — OPS-4453.';
const DEACTIVATE = {
  code: 'northeastern_build',
  justification: 'Trial ended without conversion — ticket OPS-4430.',
};
/** The tenant the create frame is filled with, and the list frame highlights. */
const FEATURED = TENANTS[1];

/** The drawing's five register rows, as an operator's import file (template columns). */
const PRICES_CSV = [
  'code,description,category,unit,central_price,currency_code',
  'MAT-STL-012,เหล็กเส้นกลม ผิวเรียบ SR24 ขนาด dia. 9 mm. x 10 m.,งานโครงสร้าง,ตัน,24850.00,THB',
  'MAT-STL-016,เหล็กข้ออ้อย SD40 ขนาด dia. 16 mm. x 10 m. มอก. 24-2559,งานโครงสร้าง,ตัน,25400.00,THB',
  'MAT-CON-240,คอนกรีตผสมเสร็จ รูปลูกบาศก์ กำลังอัด 240 ksc (ทรงกระบอก),งานคอนกรีต,ลบ.ม.,1820.00,THB',
  'MAT-CON-320,คอนกรีตผสมเสร็จ รูปลูกบาศก์ กำลังอัด 320 ksc งานสะพาน,งานคอนกรีต,ลบ.ม.,2050.00,THB',
  'MAT-BRK-001,อิฐมอญก่อผนัง ชนิด 2 รู ขนาด 6.5 x 14 x 3 ซม. มอก. 77-2545,งานสถาปัตยกรรม,ร้อยก้อน,115.00,THB',
].join('\r\n');
const BAD_PRICES_CSV = 'item,price\r\nMAT-STL-012,24850\r\n';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  // Hide the Next.js DEV overlay badge. It is `next dev` chrome, not the screen, and the issues it
  // counts are environmental — the Serwist service worker refusing to register behind a dev redirect,
  // and a report-only CSP note (browser console, 2026-09-14). Hidden from the frame only.
  await page.addInitScript(() => {
    const style = () => {
      const el = document.createElement('style');
      el.textContent = 'nextjs-portal { display: none !important; }';
      document.head.appendChild(el);
    };
    if (document.head) style();
    else document.addEventListener('DOMContentLoaded', style);
  });

  await login(page);

  // Wait for an authenticated list before any write: the first request after a page load goes out
  // before the session token is attached and answers 401 (measured 2026-09-14), and a create sent in
  // that window fails.
  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('tenant-row-EKC').waitFor({ timeout: 30_000 });

  for (const tenant of TENANTS) await createTenant(page, tenant);
  await deactivateTenant(page, DEACTIVATE);

  // bkk_metro_corp: a full run, approved at the gate, then its host.
  await markContracted(page, CONTRACT('bkk_metro_corp'));
  await waitForRowText(page, 'bkk_metro_corp', /Waiting|Ready/);
  await approveGate(page, 'bkk_metro_corp');
  await waitForRowText(page, 'bkk_metro_corp', /Ready/);
  for (const a of ASSIGN) await assignDb(page, a);
  // siam_infra_eng parks at the gate; the held tenant stays in CREATING_RDS.
  await markContracted(page, CONTRACT('siam_infra_eng'));
  await waitForRowText(page, 'siam_infra_eng', /Waiting/);
  await markContracted(page, CONTRACT(HELD.code));
  await waitForRowText(page, HELD.code, /Creating database/);

  // ── 02 — Create Tenant, filled, not submitted ────────────────────────────────────────────────
  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('tenant-row-EKC').waitFor({ timeout: 30_000 });
  await sleep(2500);
  await page.getByRole('button', { name: /^Create Tenant$/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ timeout: 20_000 });
  await fillForm(dialog, FEATURED);
  // The frame only (never submitted): a URL in the drawing's shape, so the URI field shows its valid state.
  await fillAndKeep(
    dialog.getByLabel(/Dedicated Database URI/),
    'postgresql://db_admin:dev-placeholder@db-ent-043.cos.internal:5432/siam_infra_prod',
  );
  // Blur the last field on the dialog's own title.
  await dialog.getByRole('heading').click();
  await sleep(1500);
  // The form scrolls inside `max-h-[calc(100vh-14rem)]`; make the viewport tall enough that it does not.
  const formHeight = await page.evaluate(
    () => document.getElementById('create-tenant-form').scrollHeight,
  );
  await page.setViewportSize({ width: 1440, height: Math.max(900, formHeight + 224) });
  await sleep(1000);
  await page.screenshot({ path: `${OUT}/02-create-tenant.png` });
  await page.setViewportSize({ width: 1440, height: 900 });
  console.log('captured 02-create-tenant');

  // ── 01 — the list's success state for that tenant ────────────────────────────────────────────
  await page.goto(`${BASE}/admin?created=${FEATURED.code}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId(`tenant-row-${FEATURED.code}`).waitFor({ timeout: 30_000 });
  await page
    .getByText(/Migration gate/i)
    .first()
    .waitFor({ timeout: 30_000 });
  await sleep(3000);
  await shootWorkspace(page, '01-tenant-list');

  // ── R17 data: central prices and settings, through their pages ───────────────────────────────
  await importCentralPrices(page);
  await saveSettings(page);

  // ── 03 / 04 — Mark as Contracted and Assign DB for FRESH, filled, not submitted ──────────────
  {
    const d = await openRowModal(page, FRESH.code, /^Mark as Contracted$/);
    await fillMark(d, CONTRACT(FRESH.code));
    await shootModal(page, d, '03-mark-contracted');
  }
  {
    const d = await openRowModal(page, FRESH.code, /^Assign DB$/);
    await fillAssign(d, {
      url: 'postgresql://db_admin:dev-placeholder@db-ent-043.cos.internal:5432/thai_rail_prod',
      justification: `Route ${FRESH.code} to its dedicated instance — ticket OPS-4461.`,
    });
    await shootModal(page, d, '04-assign-dedicated-db');
  }

  // ── 05 / 06 — Audit Log and Detail for siam_infra_eng ────────────────────────────────────────
  {
    const d = await openRowModal(page, 'siam_infra_eng', /^Audit log$/);
    await d.getByRole('table').waitFor({ timeout: 30_000 });
    await sleep(1500);
    await shootModal(page, d, '05-tenant-audit-log');
  }
  {
    const d = await openRowModal(page, 'siam_infra_eng', /^View detail$/);
    await shootModal(page, d, '06-tenant-detail');
  }

  // ── 07 — Deactivate for apex_construct_th, filled, not submitted ─────────────────────────────
  {
    const d = await openRowModal(page, 'apex_construct_th', /^Deactivate$/);
    await fillAndKeep(d.getByLabel(/below to confirm tenant deactivation/), 'apex_construct_th');
    await fillAndKeep(
      d.getByLabel(/Justification/),
      'Customer requested closure at contract end — ticket OPS-4470.',
    );
    await shootModal(page, d, '07-deactivate-tenant');
  }

  // ── 08–13 — the pages ────────────────────────────────────────────────────────────────────────
  for (const [path, name, ready] of [
    ['/admin/cluster', '08-cluster', null],
    ['/admin/db-fleet', '09-db-fleet', 'fleet-row-bkk_metro_corp'],
    ['/admin/migrations', '10-data-migrations', 'run-row-siam_infra_eng'],
    ['/admin/audit', '11-global-audit-log', null],
    ['/admin/central-prices', '12-central-prices', null],
    ['/admin/settings', '13-system-settings', null],
  ]) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    if (ready) await page.getByTestId(ready).waitFor({ timeout: 30_000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    await sleep(3500);
    await shootWorkspace(page, name);
  }

  await browser.close();
}

/** The whole workspace in frame: only <main> scrolls (R13), so the viewport is made as tall as its content. */
async function shootWorkspace(page, name) {
  const workspace = await page.evaluate(() => document.querySelector('main').scrollHeight);
  await page.setViewportSize({ width: 1440, height: Math.max(900, workspace + 48) });
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await page.setViewportSize({ width: 1440, height: 900 });
  console.log(`captured ${name}`);
}

/** A modal frame: blur onto the dialog, make the viewport tall enough that the dialog is not clipped. */
async function shootModal(page, dialog, name) {
  await dialog.getByRole('heading').first().click({ force: true });
  await sleep(1200);
  const height = await dialog.evaluate((el) => {
    const modal = el.closest('[data-admin-modal]')?.firstElementChild ?? el;
    let tallest = modal.scrollHeight;
    for (const node of modal.querySelectorAll('*')) {
      if (node.scrollHeight > node.clientHeight + 1) tallest += node.scrollHeight - node.clientHeight;
    }
    return tallest;
  });
  await page.setViewportSize({ width: 1440, height: Math.max(900, height + 96) });
  await sleep(1200);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.keyboard.press('Escape');
  await sleep(500);
  console.log(`captured ${name}`);
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  // A click before the login page hydrates goes nowhere (2026-09-14) — repeat once rather than wait.
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByTestId('office-login-button').click();
    const left = await page
      .waitForURL(KEYCLOAK_URL, { timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (left) break;
  }
  await page.locator('#username').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('#kc-login').click();
  await page.waitForURL(
    (url) => !KEYCLOAK_URL.test(url.href) && !url.pathname.startsWith('/login'),
    {
      timeout: 45_000,
    },
  );
  console.log('logged in as', EMAIL);
}

/** Fill, wait, READ BACK: typing before hydration was reset to '' on 2026-09-14. */
async function fillAndKeep(locator, value) {
  for (let attempt = 0; attempt < 5; attempt++) {
    await locator.fill(value);
    await sleep(600);
    if ((await locator.inputValue()) === value) return;
  }
  throw new Error(`field did not keep its value: ${value}`);
}

/** `scope` is the Create Tenant dialog. */
async function fillForm(scope, tenant) {
  await fillAndKeep(scope.getByLabel(/Tenant Code/), tenant.code);
  await fillAndKeep(scope.getByLabel(/Tenant Name/), tenant.name);
  await scope.getByRole('radio', { name: new RegExp(tenant.plan) }).check({ force: true });
  await fillAndKeep(scope.getByLabel(/Justification/), tenant.justification);
}

async function createTenant(page, tenant) {
  // The route opens the list with the Create Tenant modal already open (R13).
  await page.goto(`${BASE}/admin/tenants/new`, { waitUntil: 'domcontentloaded' });
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ timeout: 20_000 });
  await fillForm(dialog, tenant);
  const answer = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/api/v1/admin/tenants'),
    { timeout: 20_000 },
  );
  await dialog.getByRole('button', { name: /^Create Tenant$/ }).click();
  const status = (await answer).status();
  if (status === 201) {
    await page.waitForURL((url) => url.pathname === '/admin', { timeout: 20_000 });
    console.log(`created ${tenant.code}`);
  } else if (status === 409) {
    console.log(`${tenant.code} already exists`);
  } else {
    throw new Error(`create ${tenant.code} answered ${status}`);
  }
}

/** Open the list, find a row, and open one of its row-action modals; `null` when the row has no such action. */
async function openRowModal(page, code, name, { optional = false } = {}) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  const row = page.getByTestId(`tenant-row-${code}`);
  await row.waitFor({ timeout: 30_000 });
  await sleep(2500);
  const button = row.getByRole('button', { name });
  if ((await button.count()) === 0) {
    if (optional) return null;
    throw new Error(`${code} has no ${name} action`);
  }
  await button.click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ timeout: 20_000 });
  await sleep(800);
  return dialog;
}

async function deactivateTenant(page, { code, justification }) {
  const dialog = await openRowModal(page, code, /^Deactivate$/, { optional: true });
  if (!dialog) {
    console.log(`${code} already inactive`);
    return;
  }
  await fillAndKeep(dialog.getByLabel(/below to confirm tenant deactivation/), code);
  await fillAndKeep(dialog.getByLabel(/Justification/), justification);
  const answer = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.url().endsWith('/deactivate'),
    { timeout: 20_000 },
  );
  await dialog.getByRole('button', { name: /^Confirm/ }).click();
  const status = (await answer).status();
  if (status !== 200) throw new Error(`deactivate ${code} answered ${status}`);
  console.log(`deactivated ${code}`);
}

/** Reload the list until a row shows `pattern` — a run's state is read on page load. */
async function waitForRowText(page, code, pattern, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
    const row = page.getByTestId(`tenant-row-${code}`);
    await row.waitFor({ timeout: 30_000 });
    await sleep(2500);
    if (pattern.test(await row.innerText())) return;
    if (Date.now() > deadline) throw new Error(`${code} never showed ${pattern}`);
  }
}

async function fillMark(dialog, { code, reference, justification }) {
  await fillAndKeep(dialog.getByLabel(/below to confirm Enterprise tier transition/), code);
  await fillAndKeep(dialog.getByLabel(/Contract reference/), reference);
  await fillAndKeep(dialog.getByLabel(/Justification/), justification);
}

async function markContracted(page, contract) {
  const { code } = contract;
  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  const row = page.getByTestId(`tenant-row-${code}`);
  await row.waitFor({ timeout: 30_000 });
  await sleep(2500);
  // Only a tenant with no run reads "Active" in Provisioning; one that has a run is left alone.
  if (
    (await row.getByRole('button', { name: /^Mark as Contracted$/ }).count()) === 0 ||
    !/Active/.test(await row.locator('td').nth(6).innerText())
  ) {
    console.log(`${code} already has a run or a host`);
    return;
  }
  const dialog = await openRowModal(page, code, /^Mark as Contracted$/);
  await fillMark(dialog, contract);
  const answer = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.url().includes('/mark-contracted'),
    { timeout: 20_000 },
  );
  await dialog.getByRole('button', { name: /Confirm Enterprise Contract/ }).click();
  const status = (await answer).status();
  if (status >= 300) throw new Error(`mark contracted ${code} answered ${status}`);
  console.log(`marked ${code} as contracted`);
}

async function approveGate(page, code) {
  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  const row = page.getByTestId(`tenant-row-${code}`);
  await row.waitFor({ timeout: 30_000 });
  await sleep(2500);
  const gavel = row.getByRole('button', { name: /Approve gate/ });
  if ((await gavel.count()) === 0) {
    console.log(`${code} is not at the gate`);
    return;
  }
  await gavel.click();
  const dialog = page.getByRole('dialog');
  await fillAndKeep(dialog.getByLabel(/Justification/), APPROVE_JUSTIFICATION);
  const answer = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/provisioning/approve'),
    { timeout: 20_000 },
  );
  await dialog.getByRole('button', { name: /^Approve$/ }).click();
  const status = (await answer).status();
  if (status >= 300) throw new Error(`approve ${code} answered ${status}`);
  console.log(`approved the gate for ${code}`);
}

/** The three §20.4.3 gates are ticked by the operator; the URI field opens only then. */
async function fillAssign(dialog, { url, justification }) {
  const gates = dialog.getByRole('checkbox');
  for (let i = 0; i < 3; i++) await gates.nth(i).check({ force: true });
  await fillAndKeep(dialog.getByLabel(/Dedicated Database Connection URI/), url);
  await fillAndKeep(dialog.getByLabel(/Justification/), justification);
}

async function assignDb(page, { code, url, justification }) {
  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  const row = page.getByTestId(`tenant-row-${code}`);
  await row.waitFor({ timeout: 30_000 });
  await sleep(2500);
  if (!/Pooled/.test(await row.innerText())) {
    console.log(`${code} already has a host`);
    return;
  }
  const dialog = await openRowModal(page, code, /^Assign DB$/);
  await fillAssign(dialog, { url, justification });
  const answer = page.waitForResponse(
    (r) => r.request().method() !== 'GET' && r.url().includes('/dedicated-db'),
    { timeout: 20_000 },
  );
  await dialog.getByRole('button', { name: /Confirm DB Assignment/ }).click();
  const status = (await answer).status();
  if (status >= 300) throw new Error(`assign DB ${code} answered ${status}`);
  console.log(`assigned a dedicated DB to ${code}`);
}

/** One import with the wrong columns (a FAILED run), the real file, then one sync — skipped once the catalog has rows. */
async function importCentralPrices(page) {
  await page.goto(`${BASE}/admin/central-prices`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: /Central Price Register/ }).waitFor({ timeout: 30_000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  await sleep(2500);
  if ((await page.getByText('MAT-STL-012').count()) > 0) {
    console.log('central prices already imported');
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'cos-central-prices-'));
  const bad = join(dir, 'central-prices-wrong-columns.csv');
  const good = join(dir, 'central-prices-2569-q3.csv');
  writeFileSync(bad, BAD_PRICES_CSV, 'utf8');
  writeFileSync(good, PRICES_CSV, 'utf8');

  for (const [file, expected] of [
    [bad, 422],
    [good, 200],
  ]) {
    await page.getByRole('button', { name: /^Import Central Prices$/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ timeout: 20_000 });
    await dialog.getByLabel(/Price file/).setInputFiles(file);
    await fillAndKeep(dialog.getByLabel(/Effective period/), 'Q3/2026');
    await fillAndKeep(dialog.getByLabel(/Source reference/), 'กรมบัญชีกลาง e-GP');
    await fillAndKeep(
      dialog.getByLabel(/Justification/),
      'Quarterly central price circular loaded for Q3/2026 — ticket OPS-4480.',
    );
    const answer = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/admin/central-prices/import'),
      { timeout: 30_000 },
    );
    await dialog.getByRole('button', { name: /^Import$/ }).click();
    const status = (await answer).status();
    if (status !== expected) throw new Error(`import ${file} answered ${status}, expected ${expected}`);
    console.log(`imported ${file}: ${status}`);
    await sleep(1000);
    // A refused file leaves the form open with its error; a written one shows the result. Close either by its button.
    await dialog.getByRole('button', { name: status === 200 ? /^Done$/ : /^Cancel$/ }).click();
    await dialog.waitFor({ state: 'detached', timeout: 20_000 });
    await sleep(800);
  }

  await page.getByRole('button', { name: /^Force Retry Sync$/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ timeout: 20_000 });
  await fillAndKeep(
    dialog.getByLabel(/Justification/),
    'Checking the e-GP feed after the Q3/2026 circular — ticket OPS-4481.',
  );
  const answer = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/admin/central-prices/sync'),
    { timeout: 30_000 },
  );
  await dialog.getByRole('button', { name: /^Run sync$/ }).click();
  const status = (await answer).status();
  if (status !== 200) throw new Error(`sync answered ${status}`);
  console.log('ran one sync');
  await dialog.getByRole('button', { name: /^Done$/ }).click();
  await dialog.waitFor({ state: 'detached', timeout: 20_000 });
}

/** The drawing's values, typed into System Settings and saved once — skipped once a version exists. */
async function saveSettings(page) {
  await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
  const save = page.getByRole('button', { name: /^Save changes$/ });
  await save.waitFor({ timeout: 30_000 });
  await sleep(2500);
  if ((await page.getByText(/CONFIG: v\d+/).count()) > 0) {
    console.log('settings already saved');
    return;
  }
  const main = page.locator('main');
  await fillAndKeep(main.getByPlaceholder(/name not set/).first(), 'e-GP OpenData API');
  await fillAndKeep(main.getByPlaceholder(/name not set/).nth(1), 'สนง.นโยบายและยุทธศาสตร์การค้า');
  await fillAndKeep(main.getByLabel(/^Primary endpoint URL/), 'https://api.egp.cgd.go.th/v3.2/commodity/central-prices/catalog');
  await fillAndKeep(main.getByLabel(/^Secondary endpoint URL/), 'https://api.dit.go.th/v1/commodity/construction/prices/index');
  await fillAndKeep(main.getByLabel(/^Protocol:/), 'HTTPS REST v3.2');
  await fillAndKeep(main.getByLabel(/^Max Retries:/), '5');
  await main.getByLabel(/^Auto-sync Cadence/).selectOption('Daily 04:00 Asia/Bangkok');
  await main.getByLabel(/^Failover Cache TTL/).selectOption('72');
  await main.getByRole('switch', { name: /Auto-Fallback/ }).check({ force: true });
  await main.getByRole('switch', { name: /Safety Non-Suspension/ }).check({ force: true });
  await fillAndKeep(main.getByLabel(/^Starter & Professional Tenants/), 'Sunday 01:00 - 04:00 (GMT+7)');
  await main.getByLabel(/^Enterprise maintenance mode/).selectOption('ZERO_DOWNTIME');
  await fillAndKeep(main.getByLabel(/^Lead time in hours/), '72');
  await main.getByRole('checkbox', { name: /In-app Banner/ }).check();
  await main.getByRole('checkbox', { name: /Email Digest/ }).check();
  await fillAndKeep(main.getByLabel(/^Shared tenant cap/), '250');
  await fillAndKeep(main.getByLabel(/^Default Max Pool Conns/), '120');
  const TIERS = {
    STARTER: ['Row-Level Security (Shared DB)', '50', '50000', '10000000'],
    PROFESSIONAL: ['Schema-Isolated (Shared Pool)', '250', '100000', '50000000'],
    ENTERPRISE: ['Dedicated PostgreSQL Node', '', '1000000', '250000000'],
  };
  for (const [tier, [strategy, storage, api, tokens]] of Object.entries(TIERS)) {
    const row = main.getByRole('row', { name: new RegExp(`^${tier}`) });
    await row.getByRole('button', { name: /^Edit$/ }).click();
    await fillAndKeep(main.getByLabel(`${tier} Tenant DB Strategy`), strategy);
    await fillAndKeep(main.getByLabel(`${tier} Storage Quota`), storage);
    await fillAndKeep(main.getByLabel(`${tier} API Mon. Quota`), api);
    await fillAndKeep(main.getByLabel(`${tier} Token Limit / Month`), tokens);
    await main.getByRole('button', { name: /^Done$/ }).click();
  }
  await fillAndKeep(
    main.getByLabel(/^Mandatory Operator Justification/),
    'Scheduled cluster tuning & e-GP v3.2 gateway settings recorded — ticket SEC-REQ-984.',
  );
  const answer = page.waitForResponse(
    (r) => r.request().method() === 'PUT' && r.url().endsWith('/admin/settings'),
    { timeout: 30_000 },
  );
  await save.click();
  const status = (await answer).status();
  if (status !== 200) throw new Error(`save settings answered ${status}`);
  console.log('saved system settings');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
