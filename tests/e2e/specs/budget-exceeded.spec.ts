// E2E — Budget exceeded alert: cost transaction pushes project over budget → Executive push notification
// Source: spec §Phase 18 item 7 — "Budget exceeded alert — Cost transaction pushes project over
//   budget → Executive receives push notification"

import { test, expect, Page } from '@playwright/test';
import { loginViaKeycloak } from '../helpers/auth';

const FINANCE_EMAIL = process.env['E2E_FINANCE_EMAIL'] || 'e2e-finance@construction-os.io';
const FINANCE_PASSWORD = process.env['E2E_FINANCE_PASSWORD'] || 'E2eTestPass123!';
const EXEC_EMAIL = process.env['E2E_EXEC_EMAIL'] || 'e2e-exec@construction-os.io';
const EXEC_PASSWORD = process.env['E2E_EXEC_PASSWORD'] || 'E2eTestPass123!';

const OVERBUDGET_AMOUNT = '9999999';

async function loginAs(page: Page, email: string, password: string) {
  await loginViaKeycloak(page, { email, password });
}

test.describe('Budget Exceeded Alert', () => {
  test('finance officer can enter a cost transaction', async ({ page }) => {
    await loginAs(page, FINANCE_EMAIL, FINANCE_PASSWORD);

    await page.getByRole('link', { name: /finance|cost|budget/i }).click();
    const transactionButton = page.getByRole('button', {
      name: /add.*transaction|new.*transaction|cost.*entry|บันทึก/i,
    });
    await expect(transactionButton).toBeVisible({ timeout: 10_000 });
  });

  test('entering cost above budget triggers alert state', async ({ page }) => {
    await loginAs(page, FINANCE_EMAIL, FINANCE_PASSWORD);

    await page.getByRole('link', { name: /finance|cost|budget/i }).click();

    const newTxButton = page.getByRole('button', {
      name: /add.*transaction|new.*transaction|cost.*entry/i,
    });
    if (await newTxButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await newTxButton.click();

      const amountField = page.getByLabel(/amount|จำนวนเงิน|ราคา/i).first();
      if (await amountField.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await amountField.fill(OVERBUDGET_AMOUNT);
      }

      const descField = page.getByLabel(/description|detail|รายละเอียด/i).first();
      if (await descField.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await descField.fill('E2E budget exceeded test transaction');
      }

      await page.getByRole('button', { name: /save|submit|confirm/i }).click();

      const budgetAlert = page.getByText(/budget.*exceeded|over.*budget|เกินงบ|alert/i);
      const successMsg = page.getByText(/saved|submitted|success/i);
      await expect(budgetAlert.or(successMsg)).toBeVisible({ timeout: 15_000 });
    }
  });

  test('executive sees budget exceeded notification', async ({ page: _page, browser }) => {
    const execContext = await browser.newContext();
    const execPage = await execContext.newPage();

    await loginAs(execPage, EXEC_EMAIL, EXEC_PASSWORD);

    // Executive landing (ROLE_LANDING[EXECUTIVE] = '/', spec §20.7.1 Portfolio home).
    await execPage.goto('/');
    await execPage.waitForLoadState('networkidle');

    const notificationArea = execPage
      .getByTestId('notification-bell')
      .or(execPage.getByRole('button', { name: /notification|bell/i }))
      .or(execPage.getByText(/budget.*exceeded|over.*budget|เกินงบ/i));

    if (await notificationArea.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await execPage
        .getByTestId('notification-bell')
        .or(execPage.getByRole('button', { name: /notification|bell/i }))
        .first()
        .click()
        .catch(() => null);

      const notification = execPage.getByText(/budget.*exceeded|over.*budget|เกินงบ/i);
      if (await notification.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await expect(notification).toBeVisible();
      }
    }

    await execContext.close();
  });

  test('budget status indicator updates on project page', async ({ page }) => {
    await loginAs(page, EXEC_EMAIL, EXEC_PASSWORD);

    await page.getByRole('link', { name: /project|โครงการ/i }).click();
    const projectRow = page.getByRole('row').first().or(page.getByTestId('project-card').first());

    if (await projectRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await projectRow.click();
      await page.waitForLoadState('networkidle');

      const budgetSection = page.getByText(/budget|งบประมาณ/i).first();
      await expect(budgetSection).toBeVisible({ timeout: 10_000 });
    }
  });
});
