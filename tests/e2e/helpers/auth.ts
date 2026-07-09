// E2E auth helper — office/management login via Keycloak OIDC (spec §20.6.1 Path B).
//
// The app's /login page has no email/password form of its own: it renders a single
// button that calls signIn('keycloak', …) and delegates to Keycloak's hosted login
// page (§20.6.1 — "Path B — email + password … Keycloak OIDC"). This helper drives
// that hosted page directly. The realm defines no custom `loginTheme`
// (infrastructure/keycloak/realms/construction-os-realm.json), so Keycloak's default
// theme applies — #username / #password / #kc-login are its stable base-theme ids.
//
// Test users are provisioned MFA-exempt on the staging seed (§30.5 "seed data reset
// per release"), so there is no TOTP step even for roles that require MFA in
// production (§20.6.1 — TENANT_ADMIN / FINANCE).

import { expect, Page } from '@playwright/test';

export interface Credentials {
  email: string;
  password: string;
}

// Keycloak's auth endpoints always live under /realms/<realm>/protocol/openid-connect/…;
// used to distinguish "still on the Keycloak page" from "redirected back into the app".
const KEYCLOAK_URL = /\/realms\//;

/**
 * Log in through the office/management path (§20.6.1 Path B: Keycloak OIDC) and wait
 * until the post-login redirect (/post-login → the role's landing page per §20.7)
 * lands on an authenticated app page.
 *
 * Asserts the app shell nav is visible rather than a specific landing route: the
 * staging user's `role` claim — and therefore its landing (ROLE_LANDING /
 * apps/web/src/lib/auth/roles.ts) — is not known to the test, so pinning an exact
 * route would be an assumption. §20.6.1 guarantees the redirect into the app, which
 * the nav landmark (AppShell) confirms.
 */
export async function loginViaKeycloak(
  page: Page,
  { email, password }: Credentials,
): Promise<void> {
  // Force the app into English for E2E. The UI defaults to Thai (locale persisted in localStorage
  // `cos.locale`, see apps/web/src/i18n), but the specs match nav/actions by their English labels
  // (e.g. getByRole('link', { name: /safety|incident/i })). Setting the locale before any app script
  // runs makes those selectors resolve against the English strings instead of the Thai defaults.
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('cos.locale', 'en');
    } catch {
      /* localStorage unavailable on the Keycloak origin — ignore */
    }
  });
  await page.goto('/login');
  // /login renders a single <button> (the office/Keycloak action; the field-role OTP
  // path is a <Link>). Clicking it navigates to the hosted Keycloak login form.
  await page.getByRole('button').click();
  await page.locator('#username').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  // Back in the app on the role landing — no longer on Keycloak, no longer on /login.
  await page.waitForURL(
    (url) => !KEYCLOAK_URL.test(url.href) && !url.pathname.startsWith('/login'),
  );
  await expect(page.getByRole('navigation')).toBeVisible();
}
