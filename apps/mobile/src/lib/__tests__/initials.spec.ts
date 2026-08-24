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

// PO 2026-08-20 made this the app's only initials rule. These are the cases the three tenant-admin
// screens used to answer differently, kept here so a re-divergence fails rather than ships.
describe('the one rule, on the cases the admin screens used to disagree about', () => {
  it('takes the first and the LAST part of a long name, not the first two', () => {
    expect(initialsOf('Waraporn Klinhom Suksawat')).toBe('WS');
  });

  it('returns nothing for a name it cannot read, so the caller can draw a glyph', () => {
    expect(initialsOf('')).toBe('');
    expect(initialsOf('   ')).toBe('');
  });
});
