// E2E — Project create flow
// Source: spec §Phase 18 — "Playwright E2E test for: login, project create, report submit, dashboard view"

import { test, expect } from '@playwright/test';
import { loginViaKeycloak } from '../helpers/auth';

const TEST_EMAIL = process.env['E2E_EMAIL'] || 'e2e-admin@construction-os.io';
const TEST_PASSWORD = process.env['E2E_PASSWORD'] || 'E2eTestPass123!';

test.beforeEach(async ({ page }) => {
  await loginViaKeycloak(page, { email: TEST_EMAIL, password: TEST_PASSWORD });
});

test.describe('Project Management', () => {
  test('user can create a new project', async ({ page }) => {
    // The create form is inline on /projects, toggled by the "New project" button: required code +
    // name (HTML-required) + a type select (defaulted) + optional budget, then "Create" (only
    // disabled while the mutation is in flight). The new project then appears in the list.
    await page.goto('/projects');
    await page.getByRole('button', { name: /new project/i }).click();

    const code = `E2E-${Date.now().toString().slice(-8)}`;
    const projectName = `E2E Project ${Date.now()}`;
    await page.getByPlaceholder(/project code/i).fill(code);
    await page.getByPlaceholder(/project name/i).fill(projectName);
    await page.getByPlaceholder(/budget/i).fill('1000000');
    await page.getByRole('button', { name: /^create$/i }).click();

    await expect(page.getByText(projectName)).toBeVisible({ timeout: 10_000 });
  });

  test('shows project in list after creation', async ({ page }) => {
    await page.getByRole('link', { name: /projects/i }).click();
    await expect(page.getByRole('table').or(page.getByRole('list'))).toBeVisible();
    const rows = page.getByRole('row').or(page.getByTestId('project-item'));
    expect(await rows.count()).toBeGreaterThan(0);
  });
});
