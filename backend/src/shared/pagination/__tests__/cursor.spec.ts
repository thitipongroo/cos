import { decodeCursor, encodeCursor } from '../cursor';

describe('encodeCursor', () => {
  it('encodes id and timestamp as opaque base64', () => {
    const cursor = encodeCursor('abc', new Date('2026-07-21T10:00:00.000Z'));

    expect(cursor).toBe(Buffer.from('abc:2026-07-21T10:00:00.000Z').toString('base64'));
    // Opaque: the caller must not be able to read the id off the wire without decoding.
    expect(cursor).not.toContain('abc');
  });
});

describe('decodeCursor', () => {
  it('round-trips what encodeCursor produced', () => {
    const createdAt = new Date('2026-07-21T10:00:00.000Z');

    expect(decodeCursor(encodeCursor('asset-1', createdAt))).toEqual({
      id: 'asset-1',
      createdAt: '2026-07-21T10:00:00.000Z',
    });
  });

  it('splits on the first colon so the ISO timestamp survives intact', () => {
    // The timestamp contains colons. Splitting on the last one, or on all of them, corrupts it —
    // the reason this is indexOf and a slice rather than String.split.
    const decoded = decodeCursor(Buffer.from('id-1:2026-07-21T10:00:00.000Z').toString('base64'));

    expect(decoded).toEqual({ id: 'id-1', createdAt: '2026-07-21T10:00:00.000Z' });
  });

  it('returns null when there is no separator', () => {
    expect(decodeCursor(Buffer.from('no-separator-here').toString('base64'))).toBeNull();
  });

  it('returns null when the id half is empty', () => {
    expect(decodeCursor(Buffer.from(':2026-07-21T10:00:00.000Z').toString('base64'))).toBeNull();
  });

  it('returns null when the timestamp half is empty', () => {
    expect(decodeCursor(Buffer.from('id-1:').toString('base64'))).toBeNull();
  });

  it.each([
    ['empty string', ''],
    ['non-base64 punctuation', '!!!'],
    ['padding only', '===='],
    ['single stray character', 'a'],
  ])('returns null for %s rather than throwing', (_label, input) => {
    // Buffer.from(x, 'base64') never throws — it drops undecodable characters. That is why the
    // implementation has no try/catch: the length guards are what reject these.
    expect(() => decodeCursor(input)).not.toThrow();
    expect(decodeCursor(input)).toBeNull();
  });
});
