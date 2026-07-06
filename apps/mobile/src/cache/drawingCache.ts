// Drawing cache (§17.4 read-only stale-while-revalidate cache for drawings; §17.7 200 MB LRU).
// Stores drawing files in expo-file-system and tracks {size, last_accessed} in a small SQLite
// metadata table. The LRU eviction *policy* is the pure, unit-tested planDrawingEviction()
// (src/sync/drawingCacheLru.ts); this module is the I/O glue (excluded from coverage, like the
// other expo-file-system / SQLite wiring — see jest.config collectCoverageFrom).
//
// SWR contract: getDrawing() returns the cached local path immediately (possibly stale); callers
// revalidate in the background by calling putDrawing() again when online.

import * as FileSystem from 'expo-file-system/legacy';
import { openDatabaseSync } from 'expo-sqlite';
import { planDrawingEviction, type DrawingCacheEntry } from '../sync/drawingCacheLru';

const CACHE_DIR = `${FileSystem.cacheDirectory ?? ''}drawings/`;

const meta = openDatabaseSync('cos_drawing_cache.db');
meta.execSync(`
  CREATE TABLE IF NOT EXISTS drawing_cache (
    key           TEXT    PRIMARY KEY NOT NULL,
    local_path    TEXT    NOT NULL,
    size_bytes    INTEGER NOT NULL,
    last_accessed INTEGER NOT NULL
  );
`);

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  }
}

function listEntries(): DrawingCacheEntry[] {
  const rows = meta.getAllSync<{ key: string; size_bytes: number; last_accessed: number }>(
    'SELECT key, size_bytes, last_accessed FROM drawing_cache',
  );
  return rows.map((r) => ({
    key: r.key,
    sizeBytes: r.size_bytes,
    lastAccessedAt: r.last_accessed,
  }));
}

/** Return the cached local path for a drawing (SWR: may be stale), or null if not cached. */
export async function getDrawing(key: string): Promise<string | null> {
  const row = meta.getFirstSync<{ local_path: string }>(
    'SELECT local_path FROM drawing_cache WHERE key = ?',
    key,
  );
  if (!row) return null;
  meta.runSync('UPDATE drawing_cache SET last_accessed = ? WHERE key = ?', Date.now(), key);
  return row.local_path;
}

/**
 * Download a drawing into the cache, evicting least-recently-used entries as needed to stay
 * within the §17.7 200 MB ceiling. Returns the local path. If the drawing alone exceeds the
 * ceiling it is still stored (after clearing the cache) so the current view can render it.
 */
export async function putDrawing(key: string, remoteUrl: string): Promise<string> {
  await ensureDir();
  const localPath = `${CACHE_DIR}${encodeURIComponent(key)}`;
  await FileSystem.downloadAsync(remoteUrl, localPath);

  const info = await FileSystem.getInfoAsync(localPath);
  const size = info.exists ? info.size : 0;

  for (const evictKey of planDrawingEviction(listEntries(), size)) {
    const victim = meta.getFirstSync<{ local_path: string }>(
      'SELECT local_path FROM drawing_cache WHERE key = ?',
      evictKey,
    );
    if (victim) {
      await FileSystem.deleteAsync(victim.local_path, { idempotent: true });
    }
    meta.runSync('DELETE FROM drawing_cache WHERE key = ?', evictKey);
  }

  meta.runSync(
    `INSERT OR REPLACE INTO drawing_cache (key, local_path, size_bytes, last_accessed)
     VALUES (?, ?, ?, ?)`,
    key,
    localPath,
    size,
    Date.now(),
  );
  return localPath;
}
