import { formatBytes } from '../formatBytes';

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    // The boundaries are asserted from both sides: 1023 is the last value that stays in bytes, 1024
    // the first that becomes KB. An off-by-one here shows on the receipt as "1024 B".
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [1024 * 1024 - 1, '1024.0 KB'],
    [1024 * 1024, '1.0 MB'],
    [1_258_291, '1.2 MB'],
  ])('renders %d as %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});
