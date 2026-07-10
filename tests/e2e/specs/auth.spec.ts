// E2E — Login flow (§20.6.1 Path B: office/management via Keycloak OIDC)
// Source: spec §Phase 18 / §30.5 item 7 — "login — user authentication via SMS OTP and
//   email/password flows; JWT issued; protected route accessible". §20.6.1: the office
//   email+password flow is handled by Keycloak's hosted login page, not a form on /login.

import { test, expect } from '../fixtures';
import { loginViaKeycloak } from '../helpers/auth';

const TEST_EMAIL = process.env['E2E_EMAIL'] || 'e2e-admin@construction-os.io';
const TEST_PASSWORD = process.env['E2E_PASSWORD'] || 'E2eTestPass123!';

test.describe('Authentication', () => {
  test('user can log in via Keycloak with valid credentials', async ({ page }) => {
    await loginViaKeycloak(page, { email: TEST_EMAIL, password: TEST_PASSWORD });
    // §20.6.1 post-login routing lands on the role's page; the app shell nav confirms
    // an authenticated session (loginViaKeycloak already waits for it).
    await expect(page.getByRole('navigation')).toBeVisible();
  });

  test('invalid credentials keep the user on Keycloak, unauthenticated', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /keycloak/i }).click(); // office → Keycloak hosted login
    await page.locator('#username').fill('wrong@example.com');
    await page.locator('#password').fill('wrongpassword');
    await page.locator('#kc-login').click();
    // Invalid credentials → Keycloak re-renders its login form and never issues a JWT, so
    // we stay on the Keycloak auth page and never reach the app. (Keycloak's error markup
    // varies by version; asserting the not-authenticated outcome is the stable check.)
    await expect(page).toHaveURL(/\/realms\//);
    await expect(page.locator('#kc-login')).toBeVisible();
  });

  test('redirects unauthenticated users to login', async ({ page }) => {
    // /projects is a protected app route; middleware redirects to the next-auth signIn
    // page (/login) when there is no session (apps/web/src/middleware.ts + options.ts).
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/login/);
  });
});
