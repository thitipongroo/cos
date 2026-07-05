// E2E — Report submit + Dashboard view
// Source: spec §Phase 18 — "Playwright E2E test for: login, project create, report submit, dashboard view"

import { test, expect } from '@playwright/test';
import { loginViaKeycloak } from '../helpers/auth';

const TEST_EMAIL = process.env['E2E_EMAIL'] || 'e2e-admin@construction-os.io';
const TEST_PASSWORD = process.env['E2E_PASSWORD'] || 'E2eTestPass123!';

test.beforeEach(async ({ page }) => {
  await loginViaKeycloak(page, { email: TEST_EMAIL, password: TEST_PASSWORD });
});

test.describe('Report Submit', () => {
  test('user can submit a daily progress report', async ({ page }) => {
    await page.getByRole('link', { name: /reports?/i }).click();
    await page.getByRole('button', { name: /new report|create report|submit report/i }).click();

    await page
      .getByLabel(/title|report name/i)
      .fill(`Daily Report ${new Date().toISOString().split('T')[0]}`);

    const textarea = page.getByRole('textbox', { name: /description|notes|content/i });
    if (await textarea.isVisible()) {
      await textarea.fill('E2E test daily progress report — automated submission');
    }

    await page.getByRole('button', { name: /submit|save|create/i }).click();
    await expect(page.getByText(/submitted|created|success/i)).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Dashboard', () => {
  test('dashboard loads and shows key metrics', async ({ page }) => {
    // Authenticated home ('/' routes to the role landing per §20.6.1 / ROLE_LANDING).
    await page.goto('/');
    await expect(page.getByRole('navigation')).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();

    const widgets = page.getByTestId(/widget|metric|card/);
    const headings = page.getByRole('heading');
    const hasContent = (await widgets.count()) > 0 || (await headings.count()) > 0;
    expect(hasContent).toBe(true);
  });

  test('dashboard loads within 3 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);
  });
});
