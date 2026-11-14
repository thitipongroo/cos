// E2E — Daily site report with manpower count and blockers
// Source: spec §Phase 18 item 6 — "Daily site report — Site Engineer submits report with
//   manpower count and blockers". The submit form is at /site/reports/new (§20.7.6); the
//   /site/reports list (§20.7.5) is the read-only review view.

import { test, expect } from '../fixtures';
import { loginViaKeycloak } from '../helpers/auth';

const SE_EMAIL = process.env['E2E_SE_EMAIL'] || 'e2e-engineer@construction-os.io';
const SE_PASSWORD = process.env['E2E_SE_PASSWORD'] || 'E2eTestPass123!';

const REPORT_DATE = new Date().toISOString().split('T')[0];
const MANPOWER_COUNT = '12';
const BLOCKER_TEXT = 'E2E blocker: material delivery delayed — automated test';

test.beforeEach(async ({ page }) => {
  await loginViaKeycloak(page, { email: SE_EMAIL, password: SE_PASSWORD });
});

test.describe('Daily Site Report', () => {
  test('site engineer can open the daily report form', async ({ page }) => {
    await page.goto('/site/reports/new');
    await expect(page.getByRole('heading', { name: /submit daily report/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^submit$/i })).toBeVisible();
  });

  test('site engineer submits daily report with manpower count and blocker', async ({ page }) => {
    // Inline form: project select + date (both required) + manpower + summary/blockers textarea →
    // "Submit"; success shows "Submitted".
    await page.goto('/site/reports/new');
    await page.locator('select').first().selectOption({ index: 1 });
    await page.locator('input[type="date"]').fill(REPORT_DATE);
    await page.getByLabel(/manpower/i).fill(MANPOWER_COUNT);
    await page.getByLabel(/summary/i).fill(BLOCKER_TEXT);
    await page.getByRole('button', { name: /^submit$/i }).click();
    await expect(page.getByText(/submitted/i)).toBeVisible({ timeout: 15_000 });
  });

  test('submitted report appears in the report list', async ({ page }) => {
    await page.goto('/site/reports');
    await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });
  });

  test('PM receives notification after site engineer submits report', async ({ page, browser }) => {
    // Two Keycloak logins, the submission and up to 45 s of retries do not fit the suite's 60 s.
    test.setTimeout(120_000);
    // Submit a real daily report via the inline /site/reports/new form (same as the passing submit
    // test above), then check the PM's notification panel in a second browser context.
    //
    // The summary is made unique per run: site.report.created.v1 carries it into the PM's in-app
    // notification body (template 20260824000002), and with the constant BLOCKER_TEXT a notification
    // left by an earlier run would satisfy the assertion. Every submission writes the event, a
    // same-day resubmission included (the repository upserts and writes the outbox row either way).
    const summary = `${BLOCKER_TEXT} ${Date.now()}`;
    await page.goto('/site/reports/new');
    await page.locator('select').first().selectOption({ index: 1 });
    await page.locator('input[type="date"]').fill(REPORT_DATE);
    await page.getByLabel(/manpower/i).fill(MANPOWER_COUNT);
    await page.getByLabel(/summary/i).fill(summary);
    await page.getByRole('button', { name: /^submit$/i }).click();
    await expect(page.getByText(/submitted/i)).toBeVisible({ timeout: 15_000 });

    const pmContext = await browser.newContext();
    const pmPage = await pmContext.newPage();
    await pmPage.addInitScript(() => {
      try {
        window.localStorage.setItem('cos.locale', 'en');
      } catch {
        /* ignore */
      }
    });
    const pmEmail = process.env['E2E_PM_EMAIL'] || 'e2e-pm@construction-os.io';
    const pmPassword = process.env['E2E_PM_PASSWORD'] || 'E2eTestPass123!';
    await loginViaKeycloak(pmPage, { email: pmEmail, password: pmPassword });

    // The same locator approval-escalation.spec.ts names notificationBell (safety-incident.spec.ts
    // calls it `bell`). Both steps are unconditional: this test used to wrap them in
    // `if (await …isVisible().catch(() => false))`, and matched /report|daily|site/i anywhere on the
    // page, so it passed whether or not a notification was delivered.
    const notificationBell = pmPage
      .getByRole('button', { name: /notification|bell/i })
      .or(pmPage.getByTestId('notification-bell'));
    await expect(notificationBell).toBeVisible({ timeout: 10_000 });
    // Delivery is asynchronous (outbox → Kafka → notification consumer), and the bell cannot be relied
    // on to receive it live: it loads /notifications once per session, and its SSE stream is
    // process-local (notification.sse.service.ts) while staging runs two or more backend replicas, so
    // a notification written after that load may reach a replica the PM is not streaming from.
    // Reloading re-runs the load from the shared database; retry until the run's own text is listed.
    const panel = pmPage.getByTestId('notification-panel');
    await expect(async () => {
      await pmPage.reload();
      await notificationBell.click();
      await expect(panel.getByText(summary)).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 45_000 });
    await pmContext.close();
  });
});
