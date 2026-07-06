// §17.7 Data Size Limits — drawing cache: 200 MB maximum, LRU eviction when full.
// Pure eviction policy (unit-tested); the expo-file-system I/O lives in src/cache/drawingCache.ts.

export const MAX_DRAWING_CACHE_BYTES = 200 * 1024 * 1024; // 200 MB

export interface DrawingCacheEntry {
  key: string;
  sizeBytes: number;
  lastAccessedAt: number; // epoch ms — lower = older = evicted first
}

/**
 * Plan LRU eviction so the cached total plus an incoming drawing stays within the ceiling.
 * Evicts the least-recently-used entries first and returns their keys (in eviction order).
 * If the incoming drawing alone exceeds the ceiling, every entry is evicted (the caller then
 * decides whether to store the oversized drawing at all).
 */
export function planDrawingEviction(
  entries: DrawingCacheEntry[],
  incomingBytes: number,
  maxBytes: number = MAX_DRAWING_CACHE_BYTES,
): string[] {
  const total = entries.reduce((sum, e) => sum + e.sizeBytes, 0);
  if (total + incomingBytes <= maxBytes) return [];

  const byLru = [...entries].sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
  const evict: string[] = [];
  let freed = 0;
  for (const e of byLru) {
    if (total - freed + incomingBytes <= maxBytes) break;
    evict.push(e.key);
    freed += e.sizeBytes;
  }
  return evict;
}
