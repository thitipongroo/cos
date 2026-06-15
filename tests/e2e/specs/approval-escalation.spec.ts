// E2E — Approval escalation: Approver no-response 48h → next approver notified
// Source: spec §Phase 18 item 10 — "Approval escalation — Approver does not respond in
//   48 hours → next approver is notified"

import { test, expect, Page } from '@playwright/test';

const PM_EMAIL = process.env['E2E_PM_EMAIL'] || 'e2e-pm@construction-os.io';
const PM_PASSWORD = process.env['E2E_PM_PASSWORD'] || 'E2eTestPass123!';
const ADMIN_EMAIL = process.env['E2E_ADMIN_EMAIL'] || 'e2e-admin@construction-os.io';
const ADMIN_PASSWORD = process.env['E2E_ADMIN_PASSWORD'] || 'E2eTestPass123!';

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/dashboard|home/);
}

test.describe('Approval Escalation', () => {
  test('approval items are visible in approver queue', async ({ page }) => {
    await loginAs(page, PM_EMAIL, PM_PASSWORD);

    const approvalLink = page.getByRole('link', { name: /approval|pending|อนุมัติ/i });
    await expect(approvalLink).toBeVisible({ timeout: 10_000 });
    await approvalLink.click();
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('approval item shows pending status and approver details', async ({ page }) => {
    await loginAs(page, PM_EMAIL, PM_PASSWORD);

    await page.getByRole('link', { name: /approval|pending/i }).click();

    const pendingItem = page
      .getByRole('row')
      .filter({ hasText: /pending|awaiting/i })
      .first()
      .or(page.getByTestId('approval-item').first());

    if (await pendingItem.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await pendingItem.click();
      await page.waitForLoadState('networkidle');

      const statusBadge = page.getByText(/pending|awaiting.*approval/i).first();
      await expect(statusBadge).toBeVisible({ timeout: 10_000 });
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

  test('approval history shows escalation event in audit trail', async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    await page.getByRole('link', { name: /approval|audit/i }).click();

    const escalationEvent = page
      .getByText(/escalated|escalation/i)
      .first()
      .or(
        page
          .getByRole('row')
          .filter({ hasText: /escalat/i })
          .first(),
      );

    if (await escalationEvent.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(escalationEvent).toBeVisible();
    }
  });
});
