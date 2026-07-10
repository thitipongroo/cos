// Shared Playwright fixtures for the Construction OS web E2E suite.
//
// Forces the app's i18n locale to English for every test. The web client defaults to
// Thai and persists the choice in localStorage under `cos.locale` (apps/web/src/i18n).
// The specs assert on English UI text (nav labels, buttons, placeholders), so we set the
// key via an init script that runs before every navigation — pinning a deterministic
// locale instead of depending on the app default.

import { test as base } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('cos.locale', 'en');
      } catch {
        /* localStorage unavailable (e.g. about:blank) — ignore */
      }
    });
    await use(page);
  },
});

export { expect } from '@playwright/test';
