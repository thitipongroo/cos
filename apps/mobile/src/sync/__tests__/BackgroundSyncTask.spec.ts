import {
  registerBackgroundSyncTask,
  scheduleBackgroundSync,
  unscheduleBackgroundSync,
  SYNC_TASK_NAME,
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
