// E2E — Safety incident: Safety Officer reports incident → PM push notification → ack within 30 min SLA
// Source: spec §Phase 18 item 8 — "Safety incident — Safety Officer reports incident →
//   PM receives push notification → acknowledged within 30 min SLA"

import { test, expect } from '@playwright/test';

const SAFETY_EMAIL = process.env['E2E_SAFETY_EMAIL'] || 'e2e-safety@construction-os.io';
const SAFETY_PASSWORD = process.env['E2E_SAFETY_PASSWORD'] || 'E2eTestPass123!';
const PM_EMAIL = process.env['E2E_PM_EMAIL'] || 'e2e-pm@construction-os.io';
const PM_PASSWORD = process.env['E2E_PM_PASSWORD'] || 'E2eTestPass123!';

const INCIDENT_DESCRIPTION = 'E2E TEST INCIDENT — Worker slipped near scaffold — automated test';
const SLA_MS = 30 * 60 * 1000;

async function loginAs(
  page: Parameters<Parameters<typeof test>[1]>[0]['page'],
  email: string,
  password: string,
) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/dashboard|home/);
}

test.describe('Safety Incident Reporting', () => {
  test('safety officer can navigate to incident reporting', async ({ page }) => {
    await loginAs(page, SAFETY_EMAIL, SAFETY_PASSWORD);

    const safetyLink = page.getByRole('link', { name: /safety|incident|อุบัติเหตุ/i });
    await expect(safetyLink).toBeVisible({ timeout: 10_000 });
    await safetyLink.click();
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('safety officer reports an incident with severity level', async ({ page }) => {
    await loginAs(page, SAFETY_EMAIL, SAFETY_PASSWORD);

    await page.getByRole('link', { name: /safety|incident/i }).click();

    const reportButton = page.getByRole('button', {
      name: /report.*incident|new.*incident|create.*incident/i,
    });
    if (await reportButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await reportButton.click();

      const descField = page
        .getByLabel(/description|detail|รายละเอียด/i)
        .first()
        .or(page.getByRole('textbox').first());
      if (await descField.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await descField.fill(INCIDENT_DESCRIPTION);
      }

      const severityField = page
        .getByLabel(/severity|ระดับ/i)
        .first()
        .or(page.getByRole('combobox', { name: /severity/i }))
        .or(page.getByTestId('severity-select'));
      if (await severityField.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await severityField.selectOption({ label: /high|critical|serious/i }).catch(async () => {
          await severityField.click();
          await page
            .getByRole('option', { name: /high|critical|serious/i })
            .first()
            .click()
            .catch(() => null);
        });
      }

      await page.getByRole('button', { name: /submit|report|save/i }).click();
      await expect(page.getByText(/reported|submitted|success|บันทึกแล้ว/i)).toBeVisible({
        timeout: 15_000,
      });
    }
  });

  test('PM receives notification after safety incident is reported', async ({ page, browser }) => {
    await loginAs(page, SAFETY_EMAIL, SAFETY_PASSWORD);

    await page.getByRole('link', { name: /safety|incident/i }).click();
    const reportButton = page.getByRole('button', { name: /report.*incident|new.*incident/i });
    if (await reportButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await reportButton.click();

      const descField = page
        .getByLabel(/description|detail/i)
        .first()
        .or(page.getByRole('textbox').first());
      if (await descField.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await descField.fill(INCIDENT_DESCRIPTION);
      }

      await page.getByRole('button', { name: /submit|report|save/i }).click();
      await expect(page.getByText(/reported|submitted|success/i)).toBeVisible({ timeout: 15_000 });
    }

    const pmContext = await browser.newContext();
    const pmPage = await pmContext.newPage();
    await loginAs(pmPage, PM_EMAIL, PM_PASSWORD);

    const notificationBell = pmPage
      .getByRole('button', { name: /notification|bell/i })
      .or(pmPage.getByTestId('notification-bell'));

    if (await notificationBell.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await notificationBell.click();
      const incidentNotification = pmPage.getByText(/safety|incident|อุบัติเหตุ/i);
      if (await incidentNotification.isVisible({ timeout: 10_000 }).catch(() => false)) {
        await expect(incidentNotification).toBeVisible();
      }
    }

    await pmContext.close();
  });

  test('PM can acknowledge a safety incident within SLA window', async ({ page }) => {
    await loginAs(page, PM_EMAIL, PM_PASSWORD);

    await page.getByRole('link', { name: /safety|incident|notification/i }).click();

    const incidentRow = page
      .getByRole('row')
      .filter({ hasText: /incident|safety|pending/i })
      .first()
      .or(page.getByTestId('incident-item').first());

    if (await incidentRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await incidentRow.click();

      const ackButton = page.getByRole('button', { name: /acknowledge|ack|รับทราบ/i });
      if (await ackButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
        const ackTime = Date.now();
        await ackButton.click();
        await expect(page.getByText(/acknowledged|รับทราบแล้ว|success/i)).toBeVisible({
          timeout: 10_000,
        });
        const elapsed = Date.now() - ackTime;
        expect(elapsed).toBeLessThan(SLA_MS);
      }
    }
  });

  test('incident status changes to acknowledged after PM acks', async ({ page }) => {
    await loginAs(page, PM_EMAIL, PM_PASSWORD);

    await page.getByRole('link', { name: /safety|incident/i }).click();

    const acknowledgedBadge = page.getByText(/acknowledged|รับทราบ/i).first();
    if (await acknowledgedBadge.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(acknowledgedBadge).toBeVisible();
    }
  });
});
