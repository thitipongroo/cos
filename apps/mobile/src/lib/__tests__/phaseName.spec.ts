import { phaseName } from '../phaseName';

describe('phaseName()', () => {
  it('splits the seeded bilingual names at the trailing bracket', () => {
    expect(phaseName('งานฐานราก (Foundation)', 'th')).toBe('งานฐานราก');
    expect(phaseName('งานฐานราก (Foundation)', 'en')).toBe('Foundation');
    expect(phaseName('งานระบบประกอบอาคาร (MEP)', 'en')).toBe('MEP');
  });

  it('returns a single-language name whole, in either locale', () => {
    expect(phaseName('Handover', 'th')).toBe('Handover');
    expect(phaseName('ส่งมอบงาน', 'en')).toBe('ส่งมอบงาน');
  });

  // A bracket inside the name is part of the name — only a TRAILING group is the translation.
  it('leaves a mid-name bracket alone', () => {
    expect(phaseName('งาน (เฟส A) ต่อเนื่อง', 'en')).toBe('งาน (เฟส A) ต่อเนื่อง');
  });

  it('falls back to the other half when one side is empty', () => {
    expect(phaseName('งานฐานราก ()', 'en')).toBe('งานฐานราก');
    expect(phaseName('(Foundation)', 'th')).toBe('Foundation');
  });

  it('trims the surrounding whitespace the column may carry', () => {
    expect(phaseName('  งานฐานราก  (Foundation)  ', 'th')).toBe('งานฐานราก');
    expect(phaseName('  Handover  ', 'en')).toBe('Handover');
  });

  // Neither half has anything to show — an empty name stays empty rather than becoming "()".
  it('gives an empty name back as empty', () => {
    expect(phaseName('()', 'en')).toBe('');
    expect(phaseName('   ', 'th')).toBe('');
  });
});
