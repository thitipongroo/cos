import { shortId } from '../shortId';

describe('shortId', () => {
  it('takes the first eight characters of a UUID, uppercased', () => {
    expect(shortId('5db19bf3-4c2a-4f1e-9a7b-2c8d1e0f3a4b')).toBe('5DB19BF3');
    expect(shortId('ec707b2f-0000-0000-0000-000000000000')).toBe('EC707B2F');
  });

  it('returns a short input unchanged apart from case', () => {
    // Not padded. A caller with a non-UUID id gets what it has rather than a value that looks like a
    // full short id but is not one.
    expect(shortId('abc')).toBe('ABC');
    expect(shortId('')).toBe('');
  });

  it('is stable — the same id always renders the same way on every screen', () => {
    // The reason this function exists: five hand-rolled copies could have drifted in length.
    const id = '5db19bf3-4c2a-4f1e-9a7b-2c8d1e0f3a4b';
    expect(shortId(id)).toHaveLength(8);
    expect(shortId(id)).toBe(shortId(id));
  });
});
