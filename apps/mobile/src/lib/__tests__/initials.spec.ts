import { initialsOf, initialsFirstTwo } from '../initials';

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

// The tenant-admin screens' rule, held here so the difference from `initialsOf` is a fact on the
// record rather than something a reader has to diff two functions to see. It is NOT the rule new
// code takes — see the note on the function.
describe('initialsFirstTwo', () => {
  it('agrees with initialsOf on a two-part name', () => {
    expect(initialsFirstTwo('Waraporn Klinhom')).toBe('WK');
    expect(initialsOf('Waraporn Klinhom')).toBe('WK');
  });

  // THE DIVERGENCE. One person shows WL in the header avatar and WK on the user list.
  it('takes the first two parts where initialsOf takes the first and the last', () => {
    expect(initialsFirstTwo('Waraporn Klinhom Suksawat')).toBe('WK');
    expect(initialsOf('Waraporn Klinhom Suksawat')).toBe('WS');
  });

  it('yields one letter for a single-word name, as initialsOf does', () => {
    expect(initialsFirstTwo('Somchai')).toBe('S');
  });

  // The second divergence: a literal question mark rather than an empty string, so these screens
  // draw "?" where the header avatar falls back to a person glyph.
  it('stands in a question mark for a name it cannot read', () => {
    expect(initialsFirstTwo('')).toBe('?');
    expect(initialsFirstTwo('   ')).toBe('?');
    expect(initialsOf('')).toBe('');
  });

  it('uppercases what it finds', () => {
    expect(initialsFirstTwo('somchai jaidee')).toBe('SJ');
  });
});
