import { initialsOf } from '../initials';

describe('initialsOf — header avatar fallback', () => {
  it('takes the first letter of the first and last name', () => {
    expect(initialsOf('Waraporn Klinhom')).toBe('WK');
  });

  it('works on Thai names', () => {
    // The default locale is th-TH (QM-3), so most names the avatar sees are Thai.
    expect(initialsOf('สมชาย ใจดี')).toBe('สใ');
  });

  it('gives one initial for a single-word name', () => {
    // Slicing a second character out of one word is not an initial, it is just the next letter.
    expect(initialsOf('Cher')).toBe('C');
  });

  it('skips middle names rather than crowding the circle', () => {
    expect(initialsOf('Ada Grace King Lovelace')).toBe('AL');
  });

  it('tolerates the messy spacing real records carry', () => {
    expect(initialsOf('  Waraporn   Klinhom  ')).toBe('WK');
  });

  it('returns empty for a missing name so the caller can show an icon', () => {
    expect(initialsOf(null)).toBe('');
    expect(initialsOf(undefined)).toBe('');
    expect(initialsOf('')).toBe('');
    expect(initialsOf('   ')).toBe('');
  });

  it('does not split a surrogate pair down the middle', () => {
    // [...str] iterates code points; str[0] would return half of an astral character.
    expect(initialsOf('𝒜da Lovelace')).toBe('𝒜L');
  });
});
