import { shortId } from '../shortId';

describe('shortId', () => {
  it('takes the last block of a UUID, upper-cased', () => {
    expect(shortId('10b53dda-0afd-5cae-8b7a-1554e2a1f0cd')).toBe('E2A1F0CD');
  });

  it('discriminates between ids that share a prefix', () => {
    // The reason it is the LAST block: ids minted together often share their leading bytes.
    const a = shortId('10b53dda-0afd-5cae-8b7a-aaaaaaaa00000001');
    const b = shortId('10b53dda-0afd-5cae-8b7a-aaaaaaaa00000002');
    expect(a).not.toBe(b);
  });

  it('renders a dash when there is no id', () => {
    expect(shortId(null)).toBe('—');
    expect(shortId(undefined)).toBe('—');
    expect(shortId('')).toBe('—');
    expect(shortId('   ')).toBe('—');
  });

  it('trims a non-UUID to the same width rather than overflowing', () => {
    expect(shortId('legacy-identifier-value')).toBe('VALUE');
    expect(shortId('SHORT')).toBe('SHORT');
  });
});
