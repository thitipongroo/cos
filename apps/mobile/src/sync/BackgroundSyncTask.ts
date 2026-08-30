// BackgroundSyncTask — registers and schedules the OS background sync job.
// Uses expo-task-manager + expo-background-fetch (spec §Phase 10 Background Sync).
// OS-imposed minimum interval: 15 minutes.
// Skips sync when battery level < 15% (spec §Phase 10 Constraints).

import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';

export const SYNC_TASK_NAME = 'COS_BACKGROUND_SYNC';

const MIN_INTERVAL_SECONDS = 15 * 60; // 15 minutes — OS-imposed minimum
/**
 * master:3745 — "Background sync respects battery saver mode (skip if battery < 15%)".
 *
 * Exported so the THRESHOLD can be asserted, not merely bracketed. The cases that existed used 0.1
 * (skip) and 1.0 (proceed); raising this to 0.5 satisfies both, and a device at 40% would stop
 * syncing in the background with nothing to say why.
 */
export const MIN_BATTERY_LEVEL = 0.15;

export function registerBackgroundSyncTask(syncFn: () => Promise<void>): void {
  TaskManager.defineTask(SYNC_TASK_NAME, async () => {
    try {
      const level = await Battery.getBatteryLevelAsync();
      if (level >= 0 && level < MIN_BATTERY_LEVEL) {
        return BackgroundFetch.BackgroundFetchResult.NoData;
      }
      await syncFn();
      return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch {
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
}

export async function scheduleBackgroundSync(): Promise<void> {
  await BackgroundFetch.registerTaskAsync(SYNC_TASK_NAME, {
    minimumInterval: MIN_INTERVAL_SECONDS,
    stopOnTerminate: false,
    startOnBoot: true,
  });
}

export async function unscheduleBackgroundSync(): Promise<void> {
  const registered = await TaskManager.isTaskRegisteredAsync(SYNC_TASK_NAME);
  if (registered) {
    await BackgroundFetch.unregisterTaskAsync(SYNC_TASK_NAME);
  }
}
