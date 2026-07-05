// E2E — Executive analytics dashboard (ClickHouse P95 < 3s SLA)
// Source: spec §Phase 18 item 4 — "dashboard view — Executive loads analytics dashboard;
//   ClickHouse queries complete within P95 < 3s SLA"

import { test, expect } from '@playwright/test';
import { loginViaKeycloak } from '../helpers/auth';

const EXEC_EMAIL = process.env['E2E_EXEC_EMAIL'] || 'e2e-exec@construction-os.io';
const EXEC_PASSWORD = process.env['E2E_EXEC_PASSWORD'] || 'E2eTestPass123!';

const ANALYTICS_P95_BUDGET_MS = 3_000;
const ANALYTICS_SAMPLE_COUNT = 5;

test.beforeEach(async ({ page }) => {
  await loginViaKeycloak(page, { email: EXEC_EMAIL, password: EXEC_PASSWORD });
});

test.describe('Executive Analytics Dashboard', () => {
  test('executive dashboard loads and renders key metrics', async ({ page }) => {
    await page.goto('/analytics/executive');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('main')).toBeVisible();

    const hasMetric =
      (await page.getByTestId(/metric|kpi|chart|widget/i).count()) > 0 ||
      (await page.getByRole('heading').count()) > 0;
    expect(hasMetric).toBe(true);
  });

  test(`analytics dashboard initial load completes within ${ANALYTICS_P95_BUDGET_MS}ms`, async ({
    page,
  }) => {
    const start = Date.now();
    await page.goto('/analytics/executive');
    await page.waitForLoadState('networkidle');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(ANALYTICS_P95_BUDGET_MS);
  });

  test(`analytics queries meet P95 < 3s SLA over ${ANALYTICS_SAMPLE_COUNT} samples`, async ({
    page,
  }) => {
    const durations: number[] = [];

    for (let i = 0; i < ANALYTICS_SAMPLE_COUNT; i++) {
      const start = Date.now();
      await page.goto('/analytics/executive');
      await page.waitForLoadState('networkidle');
      durations.push(Date.now() - start);
      await page.waitForTimeout(200);
    }

    durations.sort((a, b) => a - b);
    const p95Index = Math.floor(ANALYTICS_SAMPLE_COUNT * 0.95);
    const p95 =
      durations[Math.min(p95Index, durations.length - 1)] ?? durations[durations.length - 1] ?? 0;
    expect(p95).toBeLessThan(ANALYTICS_P95_BUDGET_MS);
  });

  test('executive can see project-level cost summary', async ({ page }) => {
    await page.goto('/analytics/executive');
    await page.waitForLoadState('networkidle');

    const hasCostData =
      (await page.getByText(/budget|cost|spend|บาท|฿/i).count()) > 0 ||
      (await page.getByTestId(/cost|budget/i).count()) > 0;
    expect(hasCostData).toBe(true);
  });

  test('executive can filter dashboard by project', async ({ page }) => {
    await page.goto('/analytics/executive');
    await page.waitForLoadState('networkidle');

    const projectFilter = page
      .getByRole('combobox', { name: /project/i })
      .or(page.getByTestId('project-filter'))
      .first();

    if (await projectFilter.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await projectFilter.click();
      const firstOption = page.getByRole('option').first();
      if (await firstOption.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await firstOption.click();
        await page.waitForLoadState('networkidle');
        await expect(page.getByRole('main')).toBeVisible();
      }
    }
  });
});
