// syncRunner — the ONE way a sync cycle is started, and the only thing that reports its status.
//
// WHY THIS EXISTS. Sync used to be started from two places that each re-implemented the same
// swallow-everything chain — a mount effect in (app)/_layout and the "Force System Sync" action in
// QuickAddMenu — and from nowhere else. In particular:
//
//   - Nothing ran on RECONNECT. `useNetworkStatus` knew the moment the signal came back and no
//     caller used it for this, so a worker who filled in reports underground had to leave and
//     re-enter the app group before any of it was sent.
//   - Nothing ran in the BACKGROUND. sync/BackgroundSyncTask.ts defines and schedules the OS job in
//     full — battery floor, 15-minute interval, startOnBoot — and `registerBackgroundSyncTask` had
//     no caller anywhere in src/, so the job was never defined and never scheduled.
//   - `syncStore.status` was never written, so `<SyncPill />` could only ever draw its idle face,
//     whatever was happening.
//
// Everything now goes through `runSyncCycle`, which also serialises: overlapping cycles would have
// two `processQueue` passes racing over the same rows, which `resetStale` (correctly) assumes cannot
// happen.

import { runPushSync } from './runPushSync';
import { runDeltaSync } from './runDeltaSync';
import { useSyncStore } from '../store/syncStore';

import { isNetworkError } from './httpFailure';

/** In-flight guard. A cycle already running is joined rather than duplicated. */
let inFlight: Promise<void> | null = null;

/**
 * Push the outbox, then pull the delta, reporting status throughout.
 *
 * Never rejects: every trigger (a mount effect, a connectivity event, an OS background job) wants
 * "try, and tell the user how it went", not an exception to handle. The outcome is in the store.
 *
 * BEING OFFLINE IS NOT AN ERROR. The pill has no offline face by deliberate product decision
 * (2026-08-06: "offline with an empty queue genuinely is synced — nothing is waiting"), so a cycle
 * that failed only because there was no signal leaves the status alone rather than painting a red
 * `sync-problem` at someone standing in a basement. What the queue holds is reported separately, by
 * the pending count.
 */
export function runSyncCycle(): Promise<void> {
  if (inFlight) return inFlight;

  const sync = useSyncStore.getState();
  sync.setStatus('syncing');
  sync.setError(null);

  inFlight = (async () => {
    let realFailure = false;

    // Push first (§17.6): local work reaches the server before the server's view overwrites the
    // local cache. A push failure must not skip the pull — the two are independent, and a device
    // that cannot send may still be able to receive.
    try {
      await runPushSync();
    } catch (err) {
      realFailure = realFailure || !isNetworkError(err);
    }

    try {
      await runDeltaSync();
    } catch (err) {
      realFailure = realFailure || !isNetworkError(err);
    }

    useSyncStore.getState().setStatus(realFailure ? 'error' : 'idle');
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

/** Test seam — clears the in-flight guard between cases. */
export function __resetSyncRunnerForTests(): void {
  inFlight = null;
}
