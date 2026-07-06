// §17.7 Data Size Limits — photo queue: max 100 photos pending upload; user warned at 80.
// Pure policy so it is unit-tested; the DB count + UI live in PhotoCapture (excluded from coverage).

export const MAX_PHOTO_QUEUE = 100;
export const PHOTO_QUEUE_WARN = 80;

export type PhotoQueueStatus = 'OK' | 'WARN' | 'FULL';

/**
 * Classify the pending-photo count against the §17.7 limits.
 *   FULL (>= 100) → block new captures until some upload/clear.
 *   WARN (>= 80)  → allow, but warn the user the queue is filling.
 *   OK            → allow.
 */
export function photoQueueStatus(pendingCount: number): PhotoQueueStatus {
  if (pendingCount >= MAX_PHOTO_QUEUE) return 'FULL';
  if (pendingCount >= PHOTO_QUEUE_WARN) return 'WARN';
  return 'OK';
}
