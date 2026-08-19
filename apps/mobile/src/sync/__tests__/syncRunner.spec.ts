const mockRunPushSync = jest.fn().mockResolvedValue(undefined);
const mockRunDeltaSync = jest.fn().mockResolvedValue(undefined);
const state = {
  setStatus: jest.fn(),
  setError: jest.fn(),
};

jest.mock('../runPushSync', () => ({ runPushSync: () => mockRunPushSync() }));
jest.mock('../runDeltaSync', () => ({ runDeltaSync: () => mockRunDeltaSync() }));
jest.mock('../../store/syncStore', () => ({ useSyncStore: { getState: () => state } }));

import { runSyncCycle, __resetSyncRunnerForTests } from '../syncRunner';

const offline = { isAxiosError: true, code: 'ERR_NETWORK' };

describe('runSyncCycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetSyncRunnerForTests();
    mockRunPushSync.mockResolvedValue(undefined);
    mockRunDeltaSync.mockResolvedValue(undefined);
  });

  it('pushes before it pulls (§17.6)', async () => {
    const order: string[] = [];
    mockRunPushSync.mockImplementation(async () => {
      order.push('push');
    });
    mockRunDeltaSync.mockImplementation(async () => {
      order.push('pull');
    });

    await runSyncCycle();

    expect(order).toEqual(['push', 'pull']);
  });

  it('reports syncing then idle', async () => {
    await runSyncCycle();
    expect(state.setStatus).toHaveBeenNthCalledWith(1, 'syncing');
    expect(state.setStatus).toHaveBeenLastCalledWith('idle');
  });

  it('clears the previous error at the start of a cycle', async () => {
    await runSyncCycle();
    expect(state.setError).toHaveBeenCalledWith(null);
  });

  it('still pulls when the push fails — a device that cannot send may still receive', async () => {
    mockRunPushSync.mockRejectedValue(new Error('push exploded'));
    await runSyncCycle();
    expect(mockRunDeltaSync).toHaveBeenCalledTimes(1);
    expect(state.setStatus).toHaveBeenLastCalledWith('error');
  });

  it('reports error when the pull fails', async () => {
    mockRunDeltaSync.mockRejectedValue(new Error('pull exploded'));
    await runSyncCycle();
    expect(state.setStatus).toHaveBeenLastCalledWith('error');
  });

  // The pill has no offline face by product decision (2026-08-06: "offline with an empty queue
  // genuinely is synced"), so a cycle that failed only for want of signal must not paint it red.
  it('does NOT report error when the only failure was being offline', async () => {
    mockRunPushSync.mockRejectedValue(offline);
    mockRunDeltaSync.mockRejectedValue(offline);

    await runSyncCycle();

    expect(state.setStatus).toHaveBeenLastCalledWith('idle');
  });

  it('reports error when a real failure accompanies an offline one', async () => {
    mockRunPushSync.mockRejectedValue(offline);
    mockRunDeltaSync.mockRejectedValue(new Error('malformed response'));

    await runSyncCycle();

    expect(state.setStatus).toHaveBeenLastCalledWith('error');
  });

  it('never rejects — every trigger wants an outcome, not an exception', async () => {
    mockRunPushSync.mockRejectedValue(new Error('boom'));
    mockRunDeltaSync.mockRejectedValue(new Error('boom'));
    await expect(runSyncCycle()).resolves.toBeUndefined();
  });

  // Four triggers now start cycles — the shell's mount effect, the reconnect listener, the manual
  // Force System Sync, and the OS background job. Two overlapping `processQueue` passes would race
  // over the same rows, which `resetStale` assumes cannot happen.
  describe('serialisation', () => {
    it('joins an in-flight cycle instead of starting a second', async () => {
      let release: (() => void) | undefined;
      mockRunPushSync.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );

      const first = runSyncCycle();
      const second = runSyncCycle();
      expect(second).toBe(first);

      release!();
      await first;
      expect(mockRunPushSync).toHaveBeenCalledTimes(1);
    });

    it('allows a new cycle once the previous one has settled', async () => {
      await runSyncCycle();
      await runSyncCycle();
      expect(mockRunPushSync).toHaveBeenCalledTimes(2);
    });

    it('releases the guard even when the cycle failed', async () => {
      mockRunPushSync.mockRejectedValueOnce(new Error('boom'));
      await runSyncCycle();
      await runSyncCycle();
      expect(mockRunDeltaSync).toHaveBeenCalledTimes(2);
    });
  });
});
