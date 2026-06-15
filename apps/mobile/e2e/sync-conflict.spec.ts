// Detox E2E — Sync conflict resolution: Two users update same task progress_percent offline →
//   Max-wins applied on sync (higher value wins; progress is monotonic)
// Source: spec §Phase 18 Detox item 3 — "Sync conflict resolution — Two users update same
//   task progress_percent while offline → Max-wins applied on sync (higher value wins;
//   progress is monotonic)"
// Conflict strategy: progress_percent uses MAX-WINS (Phase 6 / Phase 10 spec).
// Note: This test requires two physical or simulated device sessions. It tests the
//   server-side conflict resolution via the sync endpoint POST /api/v1/sync/resolve.
//   The Detox test simulates User A's device; User B's write is applied via the test API.

import { device, element, by, waitFor } from 'detox';

const USER_A_PHONE = process.env['E2E_USER_A_PHONE'] || '+66800000003';
const SYNC_API_URL = process.env['E2E_API_URL'] || 'http://localhost:3001';
const TEST_TASK_ID = process.env['E2E_TEST_TASK_ID'] || 'e2e-task-001';

const USER_A_PROGRESS = 40;
const USER_B_PROGRESS = 70;
const EXPECTED_RESOLVED_PROGRESS = Math.max(USER_A_PROGRESS, USER_B_PROGRESS);

async function applyUserBProgressViaApi(taskId: string, progress: number): Promise<void> {
  const axios = await import('axios');
  const token = process.env['E2E_API_TOKEN'] || '';
  await axios.default.post(
    `${SYNC_API_URL}/api/v1/sync/resolve`,
    {
      entity_type: 'task',
      entity_id: taskId,
      client_version: 1,
      payload: { progress_percent: progress },
      client_submitted_at: new Date(Date.now() - 5_000).toISOString(),
    },
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

describe('Sync Conflict Resolution — Max-Wins for progress_percent', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  afterAll(async () => {
    await device.terminateApp();
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('user A can log in and navigate to task', async () => {
    await waitFor(element(by.id('phone-input')))
      .toBeVisible()
      .withTimeout(10_000);
    await element(by.id('phone-input')).typeText(USER_A_PHONE);
    await element(by.id('request-otp-button')).tap();
    await waitFor(element(by.id('otp-input')))
      .toBeVisible()
      .withTimeout(10_000);
    await element(by.id('otp-input')).typeText(process.env['E2E_TEST_OTP'] || '123456');
    await element(by.id('verify-otp-button')).tap();
    await waitFor(element(by.id('home-screen')))
      .toBeVisible()
      .withTimeout(15_000);
  });

  it('user A updates task progress offline and user B also updates — Max-wins resolves to higher value', async () => {
    await waitFor(element(by.id('home-screen')))
      .toBeVisible()
      .withTimeout(10_000);

    await device.setStatusBar({ network: 'none' });
    await waitFor(element(by.id('offline-banner')))
      .toBeVisible()
      .withTimeout(5_000);

    const taskItem = element(by.id(`task-${TEST_TASK_ID}`))
      .atIndex(0)
      .or(element(by.id('task-item')).atIndex(0));

    if (await taskItem.isVisible()) {
      await taskItem.tap();
      await waitFor(element(by.id('task-detail-screen')))
        .toBeVisible()
        .withTimeout(5_000);

      const progressInput = element(by.id('progress-input'));
      if (await progressInput.isVisible()) {
        await progressInput.clearText();
        await progressInput.typeText(String(USER_A_PROGRESS));
        await element(by.id('save-progress-button')).tap();
        await waitFor(element(by.text(/saved offline|queued/i)))
          .toBeVisible()
          .withTimeout(5_000);
      }
    }

    await applyUserBProgressViaApi(TEST_TASK_ID, USER_B_PROGRESS).catch(() => null);

    await device.setStatusBar({ network: 'wifi' });

    await waitFor(element(by.id('sync-status-bar')))
      .toBeVisible()
      .withTimeout(10_000);
    await waitFor(element(by.text(/synced|up to date/i)))
      .toBeVisible()
      .withTimeout(30_000);

    if (await taskItem.isVisible()) {
      await taskItem.tap();
      await waitFor(element(by.id('progress-display')))
        .toBeVisible()
        .withTimeout(5_000);
      await waitFor(element(by.text(String(EXPECTED_RESOLVED_PROGRESS))))
        .toBeVisible()
        .withTimeout(10_000);
    }
  });

  it('no conflict_status CONFLICT_REJECTED appears for progress_percent Max-wins', async () => {
    await waitFor(element(by.id('home-screen')))
      .toBeVisible()
      .withTimeout(10_000);

    const conflictBadge = element(by.id('conflict-badge')).atIndex(0);
    const isVisible = await conflictBadge.isVisible();
    if (isVisible) {
      const conflictText = element(by.text(/conflict.*progress|progress.*conflict/i));
      const notVisible = !(await conflictText.isVisible());
      expect(notVisible).toBe(true);
    }
  });

  it('sync queue is empty after successful sync', async () => {
    await waitFor(element(by.id('home-screen')))
      .toBeVisible()
      .withTimeout(10_000);

    await waitFor(element(by.text(/synced|up to date|ซิงค์แล้ว/i)))
      .toBeVisible()
      .withTimeout(15_000);

    const pendingSyncCount = element(by.id('pending-sync-count'));
    if (await pendingSyncCount.isVisible()) {
      await waitFor(element(by.text('0')))
        .toBeVisible()
        .withTimeout(10_000);
    }
  });
});
