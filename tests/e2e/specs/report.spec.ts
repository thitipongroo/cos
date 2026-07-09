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
    // The daily-report form lives at /site/reports/new — an inline form (not a modal): project
    // select + manpower + a summary/blockers textarea, submitted with the "Submit" button; on
    // success the page shows "Submitted". (Matches apps/web/src/app/(app)/site/reports/new.)
    await page.goto('/site/reports/new');
    // project + date are the required fields that gate the (disabled) Submit button.
    await page.locator('select').first().selectOption({ index: 1 });
    await page.locator('input[type="date"]').fill(new Date().toISOString().split('T')[0]);
    await page.getByPlaceholder(/manpower/i).fill('12');
    await page
      .getByPlaceholder(/summary/i)
      .fill('E2E test daily progress report — automated submission');
    await page.getByRole('button', { name: /^submit$/i }).click();
    await expect(page.getByText(/submitted/i)).toBeVisible({ timeout: 15_000 });
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
    // Measure time-to-interactive-content, NOT networkidle: the app holds a persistent SSE
    // notifications stream (/api/v1/notifications/stream), so the network is never idle and
    // waitForLoadState('networkidle') would always time out. The role-landing <main> becoming
    // visible is the real "loaded" signal.
    const start = Date.now();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);
  });
});
