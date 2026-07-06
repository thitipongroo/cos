import { MAX_PHOTO_QUEUE, PHOTO_QUEUE_WARN, photoQueueStatus } from '../photoQueueLimit';

describe('§17.7 photo queue limit', () => {
  it('uses the spec thresholds (max 100, warn at 80)', () => {
    expect(MAX_PHOTO_QUEUE).toBe(100);
    expect(PHOTO_QUEUE_WARN).toBe(80);
  });

  it('returns FULL at or above the max (100)', () => {
    expect(photoQueueStatus(100)).toBe('FULL');
    expect(photoQueueStatus(150)).toBe('FULL');
  });

  it('returns WARN between the warn threshold and the max (80–99)', () => {
    expect(photoQueueStatus(80)).toBe('WARN');
    expect(photoQueueStatus(99)).toBe('WARN');
  });

  it('returns OK below the warn threshold', () => {
    expect(photoQueueStatus(0)).toBe('OK');
    expect(photoQueueStatus(79)).toBe('OK');
  });
});
