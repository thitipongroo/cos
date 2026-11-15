// E2E — Accessibility (WCAG 2.2 AA, spec §20.8)
//
// Automated axe-core scans of the routes a site user actually passes through. Automated checks
// catch roughly a third of WCAG failures; the rest are covered by the manual pass in
// docs/evidence/screenreader-checklist.md, which this suite does not replace.

import { test } from '../fixtures';
import { expectNoA11yViolations, expectUsableAt200PercentText } from '../helpers/a11y';
import { loginViaKeycloak } from '../helpers/auth';

const TEST_EMAIL = process.env['E2E_EMAIL'] || 'e2e-admin@construction-os.io';
const TEST_PASSWORD = process.env['E2E_PASSWORD'] || 'E2eTestPass123!';

test.describe('Accessibility — unauthenticated', () => {
  test('login page has no WCAG A/AA violations', async ({ page }) => {
    await page.goto('/login');
    await expectNoA11yViolations(page, '/login');
  });

  test('login page stays usable at 200% text size', async ({ page }) => {
    await page.goto('/login');
    await expectUsableAt200PercentText(page, '/login');
  });
});

test.describe('Accessibility — authenticated', () => {
  // One login for the whole describe: each scan is read-only, so re-authenticating per route
  // would triple the runtime for no isolation benefit.
  test.beforeEach(async ({ page }) => {
    await loginViaKeycloak(page, { email: TEST_EMAIL, password: TEST_PASSWORD });
  });

  // Routes chosen for coverage of distinct UI shapes rather than breadth: the app shell + a list
  // view, a data-dense table, and the two form pages that PART 2 migrates to react-hook-form.
  //
  // BASELINED LOCALLY 2026-11-16 (scripts/dev/e2e-local.sh, fix/e2e-local-prod-build): the first run surfaced
  // unnamed filter <select>s on /projects, /tasks and /site/issues and a sideways scroll on /projects at 200 %
  // text; fixed, and all ten cases pass. Staging (e2e-tests on refs/heads/staging) runs them too. New findings
  // are fixed rather than trimmed from this list.
  const ROUTES = ['/projects', '/tasks', '/site/issues', '/site/issues/new', '/site/reports/new'];

  for (const route of ROUTES) {
    test(`${route} has no WCAG A/AA violations`, async ({ page }) => {
      await page.goto(route);
      await expectNoA11yViolations(page, route);
    });

    test(`${route} stays usable at 200% text size`, async ({ page }) => {
      await page.goto(route);
      await expectUsableAt200PercentText(page, route);
    });
  }
});
