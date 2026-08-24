// E2E — Accessibility (WCAG 2.2 AA, spec §20.8)
//
// Automated axe-core scans of the routes a site user actually passes through. Automated checks
// catch roughly a third of WCAG failures; the rest are covered by the manual pass in
// docs/a11y/screenreader-checklist.md, which this suite does not replace.

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
  // NOT YET BASELINED. `/login` above was scanned clean locally; these five need a running backend
  // and Keycloak, so their first real run is the staging pipeline (e2e-tests runs only on
  // refs/heads/staging). Expect the first run to surface findings — that is the point — and fix
  // them rather than trimming this list.
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
