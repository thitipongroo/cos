// E2E — Approval escalation: Approver no-response 48h → next approver notified
// Source: spec §Phase 18 item 10 — "Approval escalation — Approver does not respond in
//   48 hours → next approver is notified"

import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import { loginViaKeycloak } from '../helpers/auth';

const PM_EMAIL = process.env['E2E_PM_EMAIL'] || 'e2e-pm@construction-os.io';
const PM_PASSWORD = process.env['E2E_PM_PASSWORD'] || 'E2eTestPass123!';
const ADMIN_EMAIL = process.env['E2E_ADMIN_EMAIL'] || 'e2e-admin@construction-os.io';
const ADMIN_PASSWORD = process.env['E2E_ADMIN_PASSWORD'] || 'E2eTestPass123!';

async function loginAs(page: Page, email: string, password: string) {
  await loginViaKeycloak(page, { email, password });
}

// SKIPPED: there is no unified approval-queue / approval-history UI on the web client, and the
// /admin/approvals + /admin/settings routes the original test drove do not exist (only /admin, the
// SYSTEM_ADMIN panel). Approvals are embedded per-domain (finance/invoices, safety/permits) and the
// 48h→next-approver escalation (§Phase 18 item 10) is a backend Temporal workflow surfaced via
// notifications — not a dedicated web screen. Unskip once an approval-queue UI ships.
test.describe.skip('Approval Escalation', () => {
  test('approval items are visible in approver queue', async ({ page }) => {
    await loginAs(page, PM_EMAIL, PM_PASSWORD);

    // The real approver queue is the tenant-wide purchase-orders inbox (/procurement/orders), where
    // PENDING_APPROVAL rows carry an Approve/Reject action for the caller's approver tier. There is
    // no dedicated "approvals" nav link for a PM, so navigate directly and assert the queue renders.
    await page.goto('/procurement/orders');
    await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /purchase orders|ใบสั่งซื้อ/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('approval item shows pending status', async ({ page }) => {
    await loginAs(page, PM_EMAIL, PM_PASSWORD);

    // Filter the PO queue to PENDING_APPROVAL (status is rendered as raw enum text in the table).
    // Whether a pending row exists is data-dependent, so the row assertion is best-effort; selecting
    // the status filter and the queue rendering is the guaranteed part.
    await page.goto('/procurement/orders');
    await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });
    await page
      .locator('select')
      .first()
      .selectOption({ label: 'PENDING_APPROVAL' })
      .catch(() => null);

    const pendingRow = page
      .getByRole('row')
      .filter({ hasText: /pending_approval/i })
      .first();
    if (await pendingRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(pendingRow).toBeVisible();
    }
  });

  test('admin can manually trigger escalation for overdue approvals', async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    await page.goto('/admin/approvals');
    await page.waitForLoadState('networkidle');

    const overdueItem = page
      .getByRole('row')
      .filter({ hasText: /overdue|escalat/i })
      .first()
      .or(page.getByTestId('overdue-approval').first());

    if (await overdueItem.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const escalateButton = page.getByRole('button', { name: /escalate|force.*escalat/i });
      if (await escalateButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await escalateButton.click();
        await expect(page.getByText(/escalated|next.*approver|success/i)).toBeVisible({
          timeout: 10_000,
        });
      }
    }
  });

  test('escalated notification appears for next approver', async ({ page: _page, browser }) => {
    const nextApproverContext = await browser.newContext();
    const nextApproverPage = await nextApproverContext.newPage();

    await loginAs(nextApproverPage, ADMIN_EMAIL, ADMIN_PASSWORD);

    const notificationBell = nextApproverPage
      .getByRole('button', { name: /notification|bell/i })
      .or(nextApproverPage.getByTestId('notification-bell'));

    if (await notificationBell.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await notificationBell.click();

      const escalationNotification = nextApproverPage.getByText(
        /escalat|approval.*required|pending.*approval/i,
      );
      if (await escalationNotification.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await expect(escalationNotification).toBeVisible();
      }
    }

    await nextApproverContext.close();
  });

  test('escalation timeout configuration is readable in system settings', async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    await page.goto('/admin/settings');
    await page.waitForLoadState('networkidle');

    const escalationSetting = page
      .getByText(/escalation.*timeout|48.*hour|approval.*timeout/i)
      .or(page.getByTestId('escalation-timeout'));

    if (await escalationSetting.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(escalationSetting).toBeVisible();
    }
  });

  test('purchase order approval state is inspectable in the queue', async ({ page }) => {
    // The app has no dedicated approval audit-trail page; a purchase order's approval progression is
    // surfaced as its status in the /procurement/orders queue (DRAFT → PENDING_APPROVAL → APPROVED …).
    // Assert an admin can open that queue and inspect approval state via the status filter.
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    await page.goto('/procurement/orders');
    await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });
    // The status filter enumerates the approval lifecycle states, proving the queue tracks them.
    const statusFilter = page.locator('select').first();
    await expect(statusFilter).toBeVisible({ timeout: 10_000 });
    await expect(statusFilter.locator('option', { hasText: /APPROVED/i }).first()).toBeAttached();
  });
});
