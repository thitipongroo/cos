import {
  MAX_DRAWING_CACHE_BYTES,
  planDrawingEviction,
  type DrawingCacheEntry,
} from '../drawingCacheLru';

const MB = 1024 * 1024;

describe('§17.7 drawing cache LRU eviction', () => {
  it('caps the drawing cache at 200 MB', () => {
    expect(MAX_DRAWING_CACHE_BYTES).toBe(200 * MB);
  });

  it('evicts nothing when the incoming drawing fits', () => {
    const entries: DrawingCacheEntry[] = [
      { key: 'a', sizeBytes: 50 * MB, lastAccessedAt: 1 },
      { key: 'b', sizeBytes: 50 * MB, lastAccessedAt: 2 },
    ];
    expect(planDrawingEviction(entries, 50 * MB)).toEqual([]);
  });

  it('evicts nothing for an empty cache within budget', () => {
    expect(planDrawingEviction([], 10 * MB)).toEqual([]);
  });

  it('evicts the least-recently-used entry first, stopping once it fits', () => {
    const entries: DrawingCacheEntry[] = [
      { key: 'newest', sizeBytes: 80 * MB, lastAccessedAt: 300 },
      { key: 'oldest', sizeBytes: 80 * MB, lastAccessedAt: 100 },
      { key: 'middle', sizeBytes: 80 * MB, lastAccessedAt: 200 },
    ];
    // total 240 MB + 40 incoming = 280 → must free 80 MB → evict just the oldest.
    expect(planDrawingEviction(entries, 40 * MB)).toEqual(['oldest']);
  });

  it('evicts multiple LRU entries when one is not enough', () => {
    const entries: DrawingCacheEntry[] = [
      { key: 'oldest', sizeBytes: 60 * MB, lastAccessedAt: 100 },
      { key: 'middle', sizeBytes: 60 * MB, lastAccessedAt: 200 },
      { key: 'newest', sizeBytes: 60 * MB, lastAccessedAt: 300 },
    ];
    // total 180 MB + 150 incoming = 330 → free 130 MB → evict oldest + middle (120)…
    // still 60+150=210>200 → also newest.
    expect(planDrawingEviction(entries, 150 * MB)).toEqual(['oldest', 'middle', 'newest']);
  });

  it('evicts everything when the incoming drawing alone exceeds the ceiling', () => {
    const entries: DrawingCacheEntry[] = [
      { key: 'a', sizeBytes: 10 * MB, lastAccessedAt: 1 },
      { key: 'b', sizeBytes: 10 * MB, lastAccessedAt: 2 },
    ];
    expect(planDrawingEviction(entries, 250 * MB)).toEqual(['a', 'b']);
  });
});
