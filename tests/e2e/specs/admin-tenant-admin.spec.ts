// E2E — a tenant's first TENANT_ADMIN, from the SYSTEM_ADMIN panel (ADR-110; spec §7.6 step 10, §7.10).
//
// Staging only: it signs in through Keycloak as a SYSTEM_ADMIN, which needs E2E_SYSADMIN_EMAIL / _PASSWORD
// (secrets of the e2e job) and `s1.tenant.bootstrap-admin` ON for the staging environment. Without the credentials
// the whole describe is skipped, at describe level so the Keycloak login in beforeEach never runs (see the same note
// in dashboard.spec.ts).
//
// Each run opens its own trial (a code with a timestamp) and invites an address on the e2e domain, so runs do not
// collide; the staging seed is reset per release (§30.5). Whether the invitation email is SENT depends on the
// realm's SMTP — the test accepts either result and asserts the screen says which one happened.

import { test, expect } from '../fixtures';
import { loginViaKeycloak } from '../helpers/auth';

const SYSADMIN_EMAIL = process.env['E2E_SYSADMIN_EMAIL'];
const SYSADMIN_PASSWORD = process.env['E2E_SYSADMIN_PASSWORD'];
const JUSTIFICATION = 'E2E — ADR-110 first tenant admin, automated staging run.';

test.describe('SYSTEM_ADMIN · first tenant admin (ADR-110)', () => {
  test.skip(
    !SYSADMIN_EMAIL || !SYSADMIN_PASSWORD,
    'needs E2E_SYSADMIN_EMAIL / E2E_SYSADMIN_PASSWORD (a staging SYSTEM_ADMIN)',
  );

  const run = Date.now().toString(36);
  const code = `e2e_ta_${run}`;
  const adminEmail = `e2e-tenant-admin+${run}@construction-os.io`;

  test.beforeEach(async ({ page }) => {
    await loginViaKeycloak(page, { email: SYSADMIN_EMAIL!, password: SYSADMIN_PASSWORD! });
  });

  test('open a trial, create its administrator, and see the action change and the audit row', async ({
    page,
  }) => {
    await page.goto('/admin');

    // 1. A fresh trial — it has no administrator.
    await page.getByRole('button', { name: 'Start free trial' }).click();
    const trial = page.getByRole('dialog');
    await trial.getByLabel('Tenant Code').fill(code);
    await trial.getByLabel('Tenant Name').fill(`E2E Tenant Admin ${run}`);
    await trial.getByLabel('Justification').fill(JUSTIFICATION);
    await trial.getByRole('button', { name: 'Start trial' }).click();
    await expect(trial).toBeHidden();

    const row = page.getByTestId(`tenant-row-${code}`);
    await expect(row).toBeVisible();

    // 2. The row offers "Create tenant admin" and not "Resend".
    await expect(row.getByRole('button', { name: 'Resend admin invitation' })).toHaveCount(0);
    await row.getByRole('button', { name: 'Create tenant admin' }).click();

    const modal = page.getByRole('dialog');
    await expect(modal.getByRole('heading', { name: 'Create tenant admin' })).toBeVisible();
    // The 72-hour terms are printed before anything is sent.
    await expect(modal.getByText(/72 hours/)).toBeVisible();

    // Client-side rules come from @cos/schemas: a short justification is refused before any request.
    await modal.getByLabel('Full name').fill('E2E Owner');
    await modal.getByLabel('Work email').fill(adminEmail);
    await modal.getByLabel('Justification').fill('short');
    await modal.getByRole('button', { name: 'Create and send invitation' }).click();
    await expect(modal.getByRole('heading', { name: 'Create tenant admin' })).toBeVisible();

    await modal.getByLabel('Justification').fill(JUSTIFICATION);
    await modal.getByRole('button', { name: 'Create and send invitation' }).click();

    // 3. The result says which happened: sent (with the address) or created but not sent.
    const sent = modal.getByRole('status').filter({ hasText: 'Invitation sent to' });
    const notSent = modal.getByRole('alert').filter({ hasText: 'could not be sent' });
    await expect(sent.or(notSent)).toBeVisible();
    if (await sent.isVisible()) await expect(sent).toContainText(adminEmail);
    await modal.getByRole('button', { name: 'Done' }).click();

    // 4. The tenant now has an administrator who has not signed in: Resend replaces Create.
    await expect(row.getByRole('button', { name: 'Create tenant admin' })).toHaveCount(0);
    await expect(row.getByRole('button', { name: 'Resend admin invitation' })).toBeVisible();

    // 5. A second create is impossible from the panel, and the action is in the Global Audit Log.
    await page.goto('/admin/audit');
    await page.getByLabel('Filter by action category').selectOption('bootstrapAdmin');
    await expect(page.getByText(code).first()).toBeVisible();
  });
});
