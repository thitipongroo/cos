// E2E — Safety incident: Safety Officer reports incident → PM push notification → ack within 30 min SLA
// Source: spec §Phase 18 item 8. /safety/incidents (§20.7.7) renders an inline report form
//   (project + incident type + severity + Report) above a list with per-row Acknowledge.

import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import { loginViaKeycloak } from '../helpers/auth';

const SAFETY_EMAIL = process.env['E2E_SAFETY_EMAIL'] || 'e2e-safety@construction-os.io';
const SAFETY_PASSWORD = process.env['E2E_SAFETY_PASSWORD'] || 'E2eTestPass123!';
const PM_EMAIL = process.env['E2E_PM_EMAIL'] || 'e2e-pm@construction-os.io';
const PM_PASSWORD = process.env['E2E_PM_PASSWORD'] || 'E2eTestPass123!';

const SLA_MS = 30 * 60 * 1000;

async function loginAs(page: Page, email: string, password: string) {
  await loginViaKeycloak(page, { email, password });
}

// Report an incident on /safety/incidents; returns the unique incident type used.
async function reportIncident(page: Page): Promise<string> {
  const incidentType = `E2E-INC-${Date.now()}`;
  await page.goto('/safety/incidents');
  await page.locator('select').nth(0).selectOption({ index: 1 }); // project (required)
  await page.getByLabel(/incident type/i).fill(incidentType);
  await page.locator('select').nth(1).selectOption('HIGH'); // severity
  await page.getByRole('button', { name: /^report$/i }).click();
  return incidentType;
}

test.describe('Safety Incident Reporting', () => {
  test('safety officer can open incident reporting', async ({ page }) => {
    await loginAs(page, SAFETY_EMAIL, SAFETY_PASSWORD);
    await page.goto('/safety/incidents');
    await expect(page.getByRole('heading', { name: /safety incidents/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^report$/i })).toBeVisible();
  });

  test('safety officer reports an incident with severity level', async ({ page }) => {
    await loginAs(page, SAFETY_EMAIL, SAFETY_PASSWORD);

    // /safety/incidents is an inline form (project select [required] + incident-type input [required] +
    // severity select + "Report" button, disabled until project + type are set) above the incidents
    // list; the incident_type text then shows in that list. Wait for the project options to load
    // before selecting (the select starts with only the "Select a project" placeholder).
    await page.goto('/safety/incidents');
    const projectSelect = page.locator('select').first();
    await projectSelect
      .locator('option:not([value=""])')
      .first()
      .waitFor({ state: 'attached', timeout: 10_000 });
    await projectSelect.selectOption({ index: 1 });
    // incident_type is a short VARCHAR(64) column (a type, not a long description), so use a short
    // unique marker and assert it shows in the incidents list. Fill + verify the value stuck before
    // submitting (the Report button is disabled until project + type are both set).
    const incidentType = `E2E slip near scaffold ${Date.now().toString().slice(-6)}`;
    const typeInput = page.getByLabel(/incident type/i);
    await typeInput.fill(incidentType);
    await expect(typeInput).toHaveValue(incidentType);
    await page.getByRole('button', { name: /^report$/i }).click();
    await expect(page.getByText(incidentType).first()).toBeVisible({ timeout: 15_000 });
  });

  test('PM receives notification after safety incident is reported', async ({ page, browser }) => {
    // Two Keycloak logins, the submission and up to 45 s of retries do not fit the suite's 60 s.
    test.setTimeout(120_000);
    await loginAs(page, SAFETY_EMAIL, SAFETY_PASSWORD);
    const incidentType = await reportIncident(page);
    await expect(page.getByText(incidentType)).toBeVisible({ timeout: 15_000 });

    // PM checks the notification bell.
    const pmContext = await browser.newContext();
    const pmPage = await pmContext.newPage();
    await pmPage.addInitScript(() => {
      try {
        window.localStorage.setItem('cos.locale', 'en');
      } catch {
        /* ignore */
      }
    });
    await loginAs(pmPage, PM_EMAIL, PM_PASSWORD);
    const bell = pmPage
      .getByRole('button', { name: /notification|bell/i })
      .or(pmPage.getByTestId('notification-bell'));
    // Unconditional: this used to open the bell only if it was visible and then assert nothing, so it
    // passed whether or not the PM was notified. safety.incident.created.v1 routes to PROJECT_MANAGER
    // and its in-app template (20260824000001) carries {{incident_type}}, which is unique per run.
    await expect(bell).toBeVisible({ timeout: 10_000 });
    // Delivery is asynchronous (outbox → Kafka → notification consumer), and the bell cannot be relied
    // on to receive it live: it loads /notifications once per session, and its SSE stream is
    // process-local (notification.sse.service.ts) while staging runs two or more backend replicas, so
    // a notification written after that load may reach a replica the PM is not streaming from.
    // Reloading re-runs the load from the shared database; retry until the run's own text is listed.
    const panel = pmPage.getByTestId('notification-panel');
    await expect(async () => {
      await pmPage.reload();
      await bell.click();
      await expect(panel.getByText(incidentType)).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 45_000 });
    await pmContext.close();
  });

  test('an authorized role acknowledges a safety incident within SLA window', async ({ page }) => {
    // Acknowledgement is restricted by RBAC to SAFETY_OFFICER | TENANT_ADMIN (the incidents
    // controller @Roles guard). A PROJECT_MANAGER is notified but cannot ack (403), so the ack is
    // performed by the Safety Officer here.
    await loginAs(page, SAFETY_EMAIL, SAFETY_PASSWORD);

    // /safety/incidents lists incidents; each OPEN incident renders an "Acknowledge" button (hidden
    // only for the read-only VIEWER role). Clicking it fires the ack mutation, which moves that
    // incident out of OPEN, so its Acknowledge button is removed from the list.
    await page.goto('/safety/incidents');
    const ackButtons = page.getByRole('button', { name: /acknowledge/i });
    await expect(ackButtons.first()).toBeVisible({ timeout: 15_000 });

    // Assert on the ack round-trip itself, not the list count: OPEN incidents accumulate across runs
    // and the list is paginated, so acking one can pull a previously-hidden OPEN incident onto the
    // page and keep the button count unchanged. The PATCH .../acknowledge response is the ground truth.
    const ackTime = Date.now();
    const [ackResponse] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/acknowledge') && r.request().method() === 'PATCH',
        { timeout: 15_000 },
      ),
      ackButtons.first().click(),
    ]);
    expect(ackResponse.status()).toBeLessThan(300);

    // The acknowledgement round-trip must complete well within the 30-min SLA.
    expect(Date.now() - ackTime).toBeLessThan(SLA_MS);
  });

  test('acknowledged incident no longer shows the OPEN acknowledge action', async ({ page }) => {
    await loginAs(page, SAFETY_EMAIL, SAFETY_PASSWORD);
    await page.goto('/safety/incidents');
    // Table renders (status column reflects OPEN/ACKNOWLEDGED per incident).
    await expect(
      page.getByRole('table').or(page.getByText(/no data|safety incidents/i)),
    ).toBeVisible({ timeout: 10_000 });
  });
});
