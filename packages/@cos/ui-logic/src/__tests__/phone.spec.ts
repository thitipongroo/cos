import { DEFAULT_COUNTRY_ISO2, toE164 } from '../phone';

describe('DEFAULT_COUNTRY_ISO2', () => {
  it('is the Thai home market', () => {
    expect(DEFAULT_COUNTRY_ISO2).toBe('th');
  });
});

describe('toE164', () => {
  it('strips separators and a leading trunk 0 (TH mobile)', () => {
    expect(toE164('+66', '081-234-5678')).toBe('+66812345678');
  });

  it('strips multiple leading zeros', () => {
    expect(toE164('+66', '00812345678')).toBe('+66812345678');
  });

  it('leaves a number with no trunk prefix intact (SG)', () => {
    expect(toE164('+65', '8123 4567')).toBe('+6581234567');
  });

  it('drops all non-digits from the national number', () => {
    expect(toE164('+84', '(91) 234.5678')).toBe('+84912345678');
  });
});
