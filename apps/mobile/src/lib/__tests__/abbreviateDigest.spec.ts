import { abbreviateDigest } from '../abbreviateDigest';

describe('abbreviateDigest', () => {
  it('renders a real digest the way the drawing does', () => {
    const digest = 'bcf4ab2c9093d61271c5f3ee8d4d1ecd143550cc385719f987ec083dd484a5f9';

    expect(abbreviateDigest(digest)).toBe('bcf4...a5f9');
  });

  it.each([
    ['exactly eight characters', '12345678', '12345678'],
    ['shorter than eight', 'abc', 'abc'],
    ['empty', '', ''],
  ])('returns a %s digest whole', (_label, input, expected) => {
    // Slicing these would print overlapping characters — `1234...5678` for an eight-character input
    // reads as an abbreviation of something longer, which is a lie about the value.
    expect(abbreviateDigest(input)).toBe(expected);
  });

  it('abbreviates the first value long enough to need it', () => {
    // Nine characters: the boundary on the other side of the guard above.
    expect(abbreviateDigest('123456789')).toBe('1234...6789');
  });
});
