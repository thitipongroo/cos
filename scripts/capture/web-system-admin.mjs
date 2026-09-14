// Web capture — the SYSTEM_ADMIN panel (§20.4): Tenant List and Create Tenant, into
// docs/screens/web/SYSTEM_ADMIN/. Documentation generator, not a test.
//
// Produces:
//   02-create-tenant.png   the Create Tenant modal over /admin (R13), opened by the list's button, FILLED IN, before
//                          submit; the viewport is made tall enough for the modal's form not to scroll
//   01-tenant-list.png     /admin in its §20.4.2 success state for that tenant; since R13 only the workspace scrolls,
//                          so the viewport is made as tall as the workspace's content and the whole list is in frame
//
// ── THE DATA IS WRITTEN THROUGH THE PANEL ITSELF (revision R1, R4) ─────────────────────────────
// The list needs more than the one seeded tenant to show what the page does, so before shooting, this
// script CREATES the tenants below through the real Create Tenant form and DEACTIVATES one through the
// real row action — each with a justification, so each is audited. Nothing is inserted behind the
// panel's back. A re-run finds the codes taken (409), the tenant already inactive, runs already started
// and hosts already assigned, and moves on.
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
// Prereqs: docker stack up · backend on :3000 · web on :3001 started with the root .env loaded
// (`set -a; . ../../.env; set +a; npx next dev -p 3001`) · seed-realistic.ts loaded ·
// `bash scripts/dev/seed-dev-system-admin.sh` · the stub worker, from backend/:
//   set -a; . ../.env; set +a; COS_DEV_STUB_HOLD=lanna_steel_works npx ts-node test/dev/provisioning-stub-worker.ts
// Run: node scripts/capture/web-system-admin.mjs   (from repo root)

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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
];
const HELD = TENANTS[5];
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
  const workspace = await page.evaluate(() => document.querySelector('main').scrollHeight);
  await page.setViewportSize({ width: 1440, height: Math.max(900, workspace + 48) });
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/01-tenant-list.png` });
  console.log('captured 01-tenant-list');

  await browser.close();
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

async function deactivateTenant(page, { code, justification }) {
  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  const row = page.getByTestId(`tenant-row-${code}`);
  await row.waitFor({ timeout: 30_000 });
  const button = row.getByRole('button', { name: /Deactivate/ });
  if ((await button.count()) === 0) {
    console.log(`${code} already inactive`);
    return;
  }
  // The row action asks for its justification through window.prompt (decision D4).
  page.once('dialog', (dialog) => dialog.accept(justification));
  const answer = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.url().endsWith('/deactivate'),
    { timeout: 20_000 },
  );
  await button.click();
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

/** Answer a run of window.prompt dialogs in order (the row actions' flow, decision D4). */
function answerPrompts(page, answers) {
  const queue = [...answers];
  const handler = (dialog) => {
    const next = queue.shift();
    dialog.accept(next ?? '');
    if (queue.length === 0) page.off('dialog', handler);
  };
  page.on('dialog', handler);
}

async function markContracted(page, { code, reference, justification }) {
  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  const row = page.getByTestId(`tenant-row-${code}`);
  await row.waitFor({ timeout: 30_000 });
  await sleep(2500);
  const button = row.getByRole('button', { name: /Mark as Contracted/ });
  // Only a tenant with no run reads "Active" in Provisioning; one that has a run is left alone.
  if ((await button.count()) === 0 || !/Active/.test(await row.locator('td').nth(6).innerText())) {
    console.log(`${code} already has a run or a host`);
    return;
  }
  answerPrompts(page, [code, reference, justification]);
  const answer = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.url().includes('/mark-contracted'),
    { timeout: 20_000 },
  );
  await button.click();
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

async function assignDb(page, { code, url, justification }) {
  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  const row = page.getByTestId(`tenant-row-${code}`);
  await row.waitFor({ timeout: 30_000 });
  await sleep(2500);
  if (!/Pooled/.test(await row.innerText())) {
    console.log(`${code} already has a host`);
    return;
  }
  answerPrompts(page, [url, justification]);
  const answer = page.waitForResponse(
    (r) => r.request().method() !== 'GET' && r.url().includes('/dedicated-db'),
    { timeout: 20_000 },
  );
  await row.getByRole('button', { name: /^Assign DB$/ }).click();
  const status = (await answer).status();
  if (status >= 300) throw new Error(`assign DB ${code} answered ${status}`);
  console.log(`assigned a dedicated DB to ${code}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
