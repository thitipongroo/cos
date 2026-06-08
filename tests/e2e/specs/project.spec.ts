// E2E — Project create flow
// Source: spec §Phase 18 — "Playwright E2E test for: login, project create, report submit, dashboard view"

import { test, expect } from '@playwright/test';

const TEST_EMAIL = process.env['E2E_EMAIL'] || 'e2e-admin@construction-os.io';
const TEST_PASSWORD = process.env['E2E_PASSWORD'] || 'E2eTestPass123!';

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(TEST_EMAIL);
  await page.getByLabel(/password/i).fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/dashboard|home/);
});

test.describe('Project Management', () => {
  test('user can create a new project', async ({ page }) => {
    await page.getByRole('link', { name: /projects/i }).click();
    await page.getByRole('button', { name: /new project|create project/i }).click();

    const projectName = `E2E Project ${Date.now()}`;
    await page.getByLabel(/project name/i).fill(projectName);
    await page.getByLabel(/budget/i).fill('1000000');

    const currencySelect = page.getByLabel(/currency/i);
    if (await currencySelect.isVisible()) {
      await currencySelect.selectOption('THB');
    }

    await page.getByRole('button', { name: /create|submit|save/i }).click();

    await expect(page.getByText(projectName)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/created|success/i)).toBeVisible();
  });

  test('shows project in list after creation', async ({ page }) => {
    await page.getByRole('link', { name: /projects/i }).click();
    await expect(page.getByRole('table').or(page.getByRole('list'))).toBeVisible();
    const rows = page.getByRole('row').or(page.getByTestId('project-item'));
    expect(await rows.count()).toBeGreaterThan(0);
  });
});
