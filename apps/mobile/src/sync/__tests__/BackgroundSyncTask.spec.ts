import {
  registerBackgroundSyncTask,
  scheduleBackgroundSync,
  unscheduleBackgroundSync,
  SYNC_TASK_NAME,
  MIN_BATTERY_LEVEL,
} from '../BackgroundSyncTask';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';

const { _runTask, _clearTasks } = TaskManager as unknown as {
  _runTask: (name: string) => Promise<unknown>;
  _clearTasks: () => void;
};

describe('BackgroundSyncTask', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _clearTasks();
  });

  describe('registerBackgroundSyncTask', () => {
    it('defines the task with SYNC_TASK_NAME via TaskManager', () => {
      const syncFn = jest.fn().mockResolvedValue(undefined);
      registerBackgroundSyncTask(syncFn);
      expect(TaskManager.defineTask).toHaveBeenCalledWith(SYNC_TASK_NAME, expect.any(Function));
    });

    it('task callback calls syncFn and returns NewData on success', async () => {
      const syncFn = jest.fn().mockResolvedValue(undefined);
      (Battery.getBatteryLevelAsync as jest.Mock).mockResolvedValue(1.0);
      registerBackgroundSyncTask(syncFn);
      const result = await _runTask(SYNC_TASK_NAME);
      expect(syncFn).toHaveBeenCalledTimes(1);
      expect(result).toBe(BackgroundFetch.BackgroundFetchResult.NewData);
    });

    it('task callback returns NoData when battery < 15%', async () => {
      const syncFn = jest.fn().mockResolvedValue(undefined);
      (Battery.getBatteryLevelAsync as jest.Mock).mockResolvedValue(0.1);
      registerBackgroundSyncTask(syncFn);
      const result = await _runTask(SYNC_TASK_NAME);
      expect(syncFn).not.toHaveBeenCalled();
      expect(result).toBe(BackgroundFetch.BackgroundFetchResult.NoData);
    });

    // The two cases above and below bracket the threshold at 0.1 and 1.0, which leaves any value in
    // between satisfying both. master:3745 names 15%, so test the boundary itself: one reading just
    // under it must skip, and the reading AT it must proceed — "< 15%", not "<= 15%".
    it('skips at 14% and syncs at exactly 15% (master:3745)', async () => {
      const justUnder = jest.fn().mockResolvedValue(undefined);
      (Battery.getBatteryLevelAsync as jest.Mock).mockResolvedValue(0.14);
      registerBackgroundSyncTask(justUnder);
      expect(await _runTask(SYNC_TASK_NAME)).toBe(BackgroundFetch.BackgroundFetchResult.NoData);
      expect(justUnder).not.toHaveBeenCalled();

      const atThreshold = jest.fn().mockResolvedValue(undefined);
      // The LITERAL 0.15, not MIN_BATTERY_LEVEL. Feeding the constant back in would compare it to
      // itself: at any threshold the reading equals it, `level < threshold` is false, and the case
      // passes no matter what the number is.
      (Battery.getBatteryLevelAsync as jest.Mock).mockResolvedValue(0.15);
      registerBackgroundSyncTask(atThreshold);
      expect(await _runTask(SYNC_TASK_NAME)).toBe(BackgroundFetch.BackgroundFetchResult.NewData);
      expect(atThreshold).toHaveBeenCalled();
    });

    it('the threshold is 15%, not merely "some low number"', () => {
      expect(MIN_BATTERY_LEVEL).toBe(0.15);
    });

    it('task callback proceeds when battery level is -1 (unknown/plugged in)', async () => {
      const syncFn = jest.fn().mockResolvedValue(undefined);
      (Battery.getBatteryLevelAsync as jest.Mock).mockResolvedValue(-1);
      registerBackgroundSyncTask(syncFn);
      const result = await _runTask(SYNC_TASK_NAME);
      expect(syncFn).toHaveBeenCalled();
      expect(result).toBe(BackgroundFetch.BackgroundFetchResult.NewData);
    });

    it('task callback returns Failed when syncFn throws', async () => {
      const syncFn = jest.fn().mockRejectedValue(new Error('sync error'));
      (Battery.getBatteryLevelAsync as jest.Mock).mockResolvedValue(1.0);
      registerBackgroundSyncTask(syncFn);
      const result = await _runTask(SYNC_TASK_NAME);
      expect(result).toBe(BackgroundFetch.BackgroundFetchResult.Failed);
    });
  });

  describe('scheduleBackgroundSync', () => {
    it('registers task with 15-minute minimum interval', async () => {
      await scheduleBackgroundSync();
      expect(BackgroundFetch.registerTaskAsync).toHaveBeenCalledWith(SYNC_TASK_NAME, {
        minimumInterval: 900,
        stopOnTerminate: false,
        startOnBoot: true,
      });
    });
  });

  describe('unscheduleBackgroundSync', () => {
    it('unregisters task when task is registered', async () => {
      (TaskManager.isTaskRegisteredAsync as jest.Mock).mockResolvedValueOnce(true);
      await unscheduleBackgroundSync();
      expect(BackgroundFetch.unregisterTaskAsync).toHaveBeenCalledWith(SYNC_TASK_NAME);
    });

    it('does not unregister when task is not registered', async () => {
      (TaskManager.isTaskRegisteredAsync as jest.Mock).mockResolvedValueOnce(false);
      await unscheduleBackgroundSync();
      expect(BackgroundFetch.unregisterTaskAsync).not.toHaveBeenCalled();
    });
  });
});
