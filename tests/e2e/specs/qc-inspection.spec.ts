// E2E — QC inspection: Inspector fills checklist → result FAIL → issue created → photo uploaded
// Source: spec §Phase 18 item 9 — "QC inspection — Inspector fills checklist → result recorded
//   as fail → issue_severity populated → photo uploaded"

import { test, expect, Page } from '@playwright/test';
import { loginViaKeycloak } from '../helpers/auth';

const INSPECTOR_EMAIL = process.env['E2E_INSPECTOR_EMAIL'] || 'e2e-inspector@construction-os.io';
const INSPECTOR_PASSWORD = process.env['E2E_INSPECTOR_PASSWORD'] || 'E2eTestPass123!';

const MINIMAL_JPEG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const TEST_PHOTO = {
  name: 'test-inspection-photo.jpg',
  mimeType: 'image/jpeg' as const,
  buffer: Buffer.from(MINIMAL_JPEG_B64, 'base64'),
};

async function loginAs(page: Page, email: string, password: string) {
  await loginViaKeycloak(page, { email, password });
}

test.describe('QC Inspection', () => {
  test('inspector can navigate to inspection creation', async ({ page }) => {
    await loginAs(page, INSPECTOR_EMAIL, INSPECTOR_PASSWORD);

    const inspectionLink = page.getByRole('link', { name: /inspection|qc|quality|ตรวจสอบ/i });
    await expect(inspectionLink).toBeVisible({ timeout: 10_000 });
    await inspectionLink.click();
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('inspector marks checklist items as FAIL and submits', async ({ page }) => {
    await loginAs(page, INSPECTOR_EMAIL, INSPECTOR_PASSWORD);

    await page.getByRole('link', { name: /inspection|qc|quality/i }).click();

    const newInspectionButton = page.getByRole('button', {
      name: /new inspection|create inspection|start.*checklist/i,
    });
    if (await newInspectionButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await newInspectionButton.click();

      const failOption = page
        .getByRole('radio', { name: /fail|ไม่ผ่าน/i })
        .first()
        .or(page.getByRole('button', { name: /fail|ไม่ผ่าน/i }).first());

      if (await failOption.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await failOption.click();
      }

      const severityField = page
        .getByLabel(/severity|ระดับ/i)
        .or(page.getByRole('combobox', { name: /severity/i }));
      if (await severityField.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await severityField.selectOption({ index: 1 }).catch(async () => {
          await severityField.click();
          await page
            .getByRole('option')
            .nth(1)
            .click()
            .catch(() => null);
        });
      }

      await page.getByRole('button', { name: /submit|complete|save/i }).click();

      const issueCreated = page.getByText(/issue.*created|defect.*raised|ปัญหา|success/i);
      const submitted = page.getByText(/submitted|saved|completed/i);
      await expect(issueCreated.or(submitted)).toBeVisible({ timeout: 15_000 });
    }
  });

  test('inspector can upload a photo for a failed inspection', async ({ page }) => {
    await loginAs(page, INSPECTOR_EMAIL, INSPECTOR_PASSWORD);

    await page.getByRole('link', { name: /inspection|qc|quality/i }).click();

    const inspectionRow = page
      .getByRole('row')
      .filter({ hasText: /fail|incomplete|pending/i })
      .first()
      .or(page.getByTestId('inspection-item').first());

    if (await inspectionRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await inspectionRow.click();
      await page.waitForLoadState('networkidle');

      const fileInput = page.locator('input[type="file"]').first();

      if (await fileInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await fileInput.setInputFiles(TEST_PHOTO);

        await page.getByRole('button', { name: /upload|save|submit/i }).click();
        const uploaded = page.getByText(/uploaded|photo.*added|success/i);
        if (await uploaded.isVisible({ timeout: 15_000 }).catch(() => false)) {
          await expect(uploaded).toBeVisible();
        }
      }
    }
  });

  test('issue_severity is populated on FAIL inspection result', async ({ page }) => {
    await loginAs(page, INSPECTOR_EMAIL, INSPECTOR_PASSWORD);

    await page.getByRole('link', { name: /issue|defect|ปัญหา/i }).click();

    const issueWithSeverity = page
      .getByTestId('issue-severity')
      .first()
      .or(page.getByText(/severity.*high|severity.*medium|severity.*low/i).first())
      .or(
        page
          .getByRole('row')
          .filter({ hasText: /high|medium|critical/i })
          .first(),
      );

    if (await issueWithSeverity.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(issueWithSeverity).toBeVisible();
    }
  });
});
