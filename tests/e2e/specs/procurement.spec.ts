// E2E — Full procurement flow: PR → RFQ → quotation → PO → delivery → invoice
// Source: spec §Phase 18 item 5 — "Procurement flow — Create PR → generate RFQ → receive
//   quotation → approve PO → record delivery → approve vendor invoice"

import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import { loginViaKeycloak } from '../helpers/auth';

const PM_EMAIL = process.env['E2E_PM_EMAIL'] || 'e2e-pm@construction-os.io';
const PM_PASSWORD = process.env['E2E_PM_EMAIL_PASSWORD'] || 'E2eTestPass123!';
const PROC_EMAIL = process.env['E2E_PROC_EMAIL'] || 'e2e-procurement@construction-os.io';
const PROC_PASSWORD = process.env['E2E_PROC_PASSWORD'] || 'E2eTestPass123!';
const FINANCE_EMAIL = process.env['E2E_FINANCE_EMAIL'] || 'e2e-finance@construction-os.io';
const FINANCE_PASSWORD = process.env['E2E_FINANCE_PASSWORD'] || 'E2eTestPass123!';

const PO_AMOUNT = '50000';

async function loginAs(page: Page, email: string, password: string) {
  await loginViaKeycloak(page, { email, password });
}

// UNSKIPPED 2026-08-29. The note this replaces read: "there is no create-PR / generate-RFQ /
// approve-PO / record-delivery UI on the web client (verified: no useCreatePurchaseRequest/approve
// mutations exist) … Unskip once a web create/approve UI ships." That condition is met — every step
// of §Phase 18 item 5 now has a page and a mutation behind it:
//
//   create PR       → /procurement/requests        useCreatePurchaseRequest   ("Create PR" / "สร้าง PR")
//   generate RFQ    → /procurement/rfqs            useCreateRfq               ("Create RFQ" / "สร้าง RFQ")
//   award quotation → /procurement/quotations      useAwardRfq
//   approve PO      → /procurement/orders          useApprovePo / useSubmitPo ("Approve" / "อนุมัติ")
//   record delivery → /procurement/deliveries/new  useRecordDelivery
//   approve invoice → /finance/invoices            useApproveInvoice
//
// The bodies below already describe those pages field by field — they were written against the
// shipped UI while the header still claimed it did not exist, which is how the skip outlived its
// reason. tests/conformance/testing now guards the remaining skips against the same drift.
//
// Three of the six stay skipped, and NOT for the reason the old header gave. Their only `expect`
// sits inside `if (await …isVisible().catch(() => false))`, which swallows its own failure: the test
// reports green whether the behaviour happened or not. Two of them would also miss — the delivery
// form's submit button reads "Record delivery" (proc.recordDelivery), not /confirm|save/, and the
// invoice action reads "Approve" (finance.approve), not /approve.*invoice/ — and neither mismatch
// would ever surface, because the guard turns a miss into a silent pass. Running them would add the
// appearance of coverage. They are marked individually below.
//
// Gated on BASE_URL rather than run unconditionally: this drives a real login through Keycloak and
// needs seeded tenants, which only the staging deployment has. Locally BASE_URL is unset and these
// skip; in CI the e2e job sets it from secrets.STAGING_URL, which is the environment §30.5 intends
// and the first place this suite will actually execute.
const ON_DEPLOYED_ENV = Boolean(process.env['BASE_URL']);

test.describe('Procurement Flow — PR → RFQ → PO → Delivery → Invoice', () => {
  test.skip(!ON_DEPLOYED_ENV, 'needs a deployed environment with seeded tenants (BASE_URL unset)');

  test('procurement officer creates a purchase request', async ({ page }) => {
    await loginAs(page, PROC_EMAIL, PROC_PASSWORD);

    // /procurement/requests has an inline create form (not a modal): project select [required] +
    // "PR number" input [required] + Required date, submitted with "Create PR". There is no success
    // toast — on success the form clears and the new PR appears in the list table below, so assert
    // the unique PR number shows up there.
    await page.goto('/procurement/requests');
    const projectSelect = page.locator('select').first();
    await projectSelect
      .locator('option:not([value=""])')
      .first()
      .waitFor({ state: 'attached', timeout: 10_000 });
    await projectSelect.selectOption({ index: 1 });
    const prNumber = `E2E-PR-${Date.now().toString().slice(-8)}`;
    await page.getByPlaceholder(/PR number|เลขที่ PR/i).fill(prNumber);
    await page.locator('input[type="date"]').fill(new Date().toISOString().split('T')[0]);
    await page.getByRole('button', { name: /create pr|สร้าง pr/i }).click();
    await expect(page.getByText(prNumber)).toBeVisible({ timeout: 15_000 });
  });

  test('procurement officer generates an RFQ', async ({ page }) => {
    await loginAs(page, PROC_EMAIL, PROC_PASSWORD);

    // RFQs are created from the inline form on /procurement/rfqs (project select [required] + "RFQ
    // number" input [required] + a datetime-local Deadline [required], submitted with "Create RFQ").
    // No success toast — the new RFQ number appears in the list table below.
    await page.goto('/procurement/rfqs');
    const projectSelect = page.locator('select').first();
    await projectSelect
      .locator('option:not([value=""])')
      .first()
      .waitFor({ state: 'attached', timeout: 10_000 });
    await projectSelect.selectOption({ index: 1 });
    const rfqNumber = `E2E-RFQ-${Date.now().toString().slice(-8)}`;
    await page.getByPlaceholder(/RFQ number|เลขที่ RFQ/i).fill(rfqNumber);
    await page.locator('input[type="datetime-local"]').fill('2026-12-31T12:00');
    await page.getByRole('button', { name: /create rfq|สร้าง rfq/i }).click();
    await expect(page.getByText(rfqNumber)).toBeVisible({ timeout: 15_000 });
  });

  // BLOCKED: cannot fail. Its single expect is inside a visibility guard that catches its own
  // failure. Unskip once it asserts the quotation unconditionally.
  test.skip('procurement officer records a vendor quotation', async ({ page }) => {
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

  test('project manager can reach the purchase order approval queue', async ({ page }) => {
    await loginAs(page, PM_EMAIL, PM_PASSWORD);

    // The PO approval queue is /procurement/orders; a PM has no nav link to it (the procurement nav
    // group is scoped to procurement roles), so navigate directly. Rows in PENDING_APPROVAL show an
    // "Approve" button for the PM approver tier. Approving is data-dependent (needs a pending PO), so
    // that step is best-effort; reaching a rendered queue is the guaranteed assertion.
    await page.goto('/procurement/orders');
    await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });

    const approveButton = page.getByRole('button', { name: /^(approve|อนุมัติ)$/i }).first();
    if (await approveButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const [resp] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes('/approve') && r.request().method() === 'POST',
          { timeout: 15_000 },
        ),
        approveButton.click(),
      ]);
      expect(resp.status()).toBeLessThan(300);
    }
  });

  // BLOCKED: cannot fail, and would not match if it could — the submit control on
  // /procurement/deliveries/new is labelled "Record delivery" (proc.recordDelivery), which the
  // /confirm|save/ selector below does not match. Both need fixing together.
  test.skip('procurement officer records delivery', async ({ page }) => {
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

  // BLOCKED: cannot fail, and would not match if it could — /finance/invoices renders "Approve"
  // (finance.approve), which /approve.*invoice|approve.*payment/ does not match. Both need fixing
  // together.
  test.skip('finance officer approves vendor invoice', async ({ page }) => {
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
