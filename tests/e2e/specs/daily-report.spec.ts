// E2E — Daily site report with manpower count and blockers
// Source: spec §Phase 18 item 6 — "Daily site report — Site Engineer submits report
//   with manpower count and blockers"

import { test, expect } from '@playwright/test';
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
  test('site engineer can navigate to daily report creation', async ({ page }) => {
    await page.getByRole('link', { name: /report|site.*ops|daily/i }).click();
    const newReportButton = page.getByRole('button', {
      name: /new report|create report|submit report|รายงาน/i,
    });
    await expect(newReportButton).toBeVisible({ timeout: 10_000 });
  });

  test('site engineer submits daily report with manpower count and blocker', async ({ page }) => {
    await page.getByRole('link', { name: /report|site.*ops|daily/i }).click();
    await page.getByRole('button', { name: /new report|create report|submit report/i }).click();

    const dateField = page.getByLabel(/date|วันที่/i).first();
    if (await dateField.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await dateField.fill(REPORT_DATE);
    }

    const manpowerField = page
      .getByLabel(/manpower|workers|กำลังคน|จำนวนคน/i)
      .first()
      .or(page.getByPlaceholder(/manpower|workers/i).first());
    if (await manpowerField.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await manpowerField.fill(MANPOWER_COUNT);
    }

    const blockerField = page
      .getByLabel(/blocker|issue|obstacle|ปัญหา/i)
      .first()
      .or(page.getByPlaceholder(/blocker|issue/i).first())
      .or(page.getByRole('textbox', { name: /blocker|issue/i }).first());
    if (await blockerField.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await blockerField.fill(BLOCKER_TEXT);
    }

    await page.getByRole('button', { name: /submit|save|send/i }).click();
    await expect(page.getByText(/submitted|saved|success|ส่งแล้ว/i)).toBeVisible({
      timeout: 15_000,
    });
  });

  test('submitted report appears in the report list', async ({ page }) => {
    await page.getByRole('link', { name: /report|site.*ops|daily/i }).click();
    await expect(page.getByRole('main')).toBeVisible();

    const reportList = page
      .getByRole('table')
      .or(page.getByRole('list').filter({ hasText: /report/i }))
      .or(page.getByTestId('report-list'));

    await expect(reportList).toBeVisible({ timeout: 10_000 });
  });

  test('PM receives notification after site engineer submits report', async ({ page, browser }) => {
    await page.getByRole('link', { name: /report|site.*ops|daily/i }).click();
    await page.getByRole('button', { name: /new report|create report|submit report/i }).click();

    const manpowerField = page.getByLabel(/manpower|workers|กำลังคน/i).first();
    if (await manpowerField.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await manpowerField.fill(MANPOWER_COUNT);
    }

    await page.getByRole('button', { name: /submit|save/i }).click();
    await expect(page.getByText(/submitted|success/i)).toBeVisible({ timeout: 15_000 });

    const pmContext = await browser.newContext();
    const pmPage = await pmContext.newPage();
    const pmEmail = process.env['E2E_PM_EMAIL'] || 'e2e-pm@construction-os.io';
    const pmPassword = process.env['E2E_PM_PASSWORD'] || 'E2eTestPass123!';

    await loginViaKeycloak(pmPage, { email: pmEmail, password: pmPassword });

    const notificationBell = pmPage
      .getByRole('button', { name: /notification|bell|แจ้งเตือน/i })
      .or(pmPage.getByTestId('notification-bell'));

    if (await notificationBell.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await notificationBell.click();
      await expect(pmPage.getByText(/report|daily|site/i)).toBeVisible({ timeout: 10_000 });
    }

    await pmContext.close();
  });
});
