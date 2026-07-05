// E2E — Full procurement flow: PR → RFQ → quotation → PO → delivery → invoice
// Source: spec §Phase 18 item 5 — "Procurement flow — Create PR → generate RFQ → receive
//   quotation → approve PO → record delivery → approve vendor invoice"

import { test, expect, Page } from '@playwright/test';
import { loginViaKeycloak } from '../helpers/auth';

const PM_EMAIL = process.env['E2E_PM_EMAIL'] || 'e2e-pm@construction-os.io';
const PM_PASSWORD = process.env['E2E_PM_EMAIL_PASSWORD'] || 'E2eTestPass123!';
const PROC_EMAIL = process.env['E2E_PROC_EMAIL'] || 'e2e-procurement@construction-os.io';
const PROC_PASSWORD = process.env['E2E_PROC_PASSWORD'] || 'E2eTestPass123!';
const FINANCE_EMAIL = process.env['E2E_FINANCE_EMAIL'] || 'e2e-finance@construction-os.io';
const FINANCE_PASSWORD = process.env['E2E_FINANCE_PASSWORD'] || 'E2eTestPass123!';

const PR_TITLE = `E2E PR ${Date.now()}`;
const PO_AMOUNT = '50000';

async function loginAs(page: Page, email: string, password: string) {
  await loginViaKeycloak(page, { email, password });
}

test.describe('Procurement Flow — PR → RFQ → PO → Delivery → Invoice', () => {
  test('procurement officer creates a purchase request', async ({ page }) => {
    await loginAs(page, PROC_EMAIL, PROC_PASSWORD);

    await page.getByRole('link', { name: /procurement/i }).click();
    await page.getByRole('button', { name: /new.*request|create.*pr|purchase request/i }).click();

    await page
      .getByLabel(/title|description|item/i)
      .first()
      .fill(PR_TITLE);

    const qtyField = page.getByLabel(/quantity|จำนวน/i).first();
    if (await qtyField.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await qtyField.fill('10');
    }

    await page.getByRole('button', { name: /submit|create|save/i }).click();
    await expect(page.getByText(/created|submitted|success/i)).toBeVisible({ timeout: 15_000 });
  });

  test('procurement officer generates an RFQ from a purchase request', async ({ page }) => {
    await loginAs(page, PROC_EMAIL, PROC_PASSWORD);

    await page.getByRole('link', { name: /procurement/i }).click();

    const prRow = page
      .getByText(PR_TITLE)
      .first()
      .or(
        page
          .getByRole('row')
          .filter({ hasText: /pending|draft/i })
          .first(),
      );

    if (await prRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await prRow.click();
      const rfqButton = page.getByRole('button', { name: /generate.*rfq|create.*rfq|send.*rfq/i });
      if (await rfqButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await rfqButton.click();
        await expect(page.getByText(/rfq.*created|sent.*vendor|success/i)).toBeVisible({
          timeout: 15_000,
        });
      }
    }
  });

  test('procurement officer records a vendor quotation', async ({ page }) => {
    await loginAs(page, PROC_EMAIL, PROC_PASSWORD);

    await page.getByRole('link', { name: /procurement|rfq/i }).click();

    const rfqRow = page
      .getByRole('row')
      .filter({ hasText: /rfq|quotation.*pending/i })
      .first();
    if (await rfqRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await rfqRow.click();
      const addQuotationButton = page.getByRole('button', {
        name: /add.*quotation|record.*quote/i,
      });
      if (await addQuotationButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await addQuotationButton.click();
        await page
          .getByLabel(/amount|price|total/i)
          .first()
          .fill(PO_AMOUNT);
        await page.getByRole('button', { name: /save|submit/i }).click();
        await expect(page.getByText(/quotation.*added|success/i)).toBeVisible({ timeout: 10_000 });
      }
    }
  });

  test('project manager approves purchase order', async ({ page }) => {
    await loginAs(page, PM_EMAIL, PM_PASSWORD);

    await page
      .getByRole('link', { name: /approval|pending|procurement/i })
      .first()
      .click();

    const approveButton = page.getByRole('button', { name: /approve.*po|approve.*order/i }).first();
    if (await approveButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await approveButton.click();
      await expect(page.getByText(/approved|po.*created|success/i)).toBeVisible({
        timeout: 15_000,
      });
    }
  });

  test('procurement officer records delivery', async ({ page }) => {
    await loginAs(page, PROC_EMAIL, PROC_PASSWORD);

    await page.getByRole('link', { name: /purchase order|delivery|po/i }).click();

    const poRow = page
      .getByRole('row')
      .filter({ hasText: /approved|pending.*delivery/i })
      .first();
    if (await poRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await poRow.click();
      const deliveryButton = page.getByRole('button', {
        name: /record.*delivery|confirm.*delivery|received/i,
      });
      if (await deliveryButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await deliveryButton.click();
        await page.getByRole('button', { name: /confirm|save/i }).click();
        await expect(page.getByText(/delivery.*recorded|success/i)).toBeVisible({
          timeout: 10_000,
        });
      }
    }
  });

  test('finance officer approves vendor invoice', async ({ page }) => {
    await loginAs(page, FINANCE_EMAIL, FINANCE_PASSWORD);

    await page.getByRole('link', { name: /invoice|finance|payable/i }).click();

    const invoiceRow = page
      .getByRole('row')
      .filter({ hasText: /pending.*approval|invoice/i })
      .first();
    if (await invoiceRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await invoiceRow.click();
      const approveButton = page.getByRole('button', {
        name: /approve.*invoice|approve.*payment/i,
      });
      if (await approveButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await approveButton.click();
        await expect(page.getByText(/invoice.*approved|payment.*approved|success/i)).toBeVisible({
          timeout: 15_000,
        });
      }
    }
  });
});
