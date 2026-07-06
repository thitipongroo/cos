// §17.7 Data Size Limits — max local DB size per device: 500 MB.
// Pure policy (unit-tested); the byte measurement + surfacing live in db/database.ts (excluded).

export const MAX_LOCAL_DB_BYTES = 500 * 1024 * 1024; // 500 MB
export const LOCAL_DB_WARN_BYTES = Math.floor(MAX_LOCAL_DB_BYTES * 0.9); // warn at 90%

export type LocalDbStatus = 'OK' | 'WARN' | 'FULL';

/**
 * Classify the local DB size against the §17.7 ceiling.
 *   FULL (>= 500 MB) → stop growing read caches; oldest cached rows should be pruned.
 *   WARN (>= 450 MB) → surface a warning; the device is approaching the cap.
 *   OK               → within budget.
 */
export function localDbStatus(sizeBytes: number): LocalDbStatus {
  if (sizeBytes >= MAX_LOCAL_DB_BYTES) return 'FULL';
  if (sizeBytes >= LOCAL_DB_WARN_BYTES) return 'WARN';
  return 'OK';
}
