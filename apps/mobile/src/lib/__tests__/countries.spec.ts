import {
  COUNTRIES,
  DEFAULT_COUNTRY_ISO2,
  FLAG_SVG,
  countryFromRegion,
  findCountry,
  toE164,
} from '../countries';

describe('countries — OTP phone split/combine', () => {
  it('every country has a bundled flag SVG', () => {
    for (const c of COUNTRIES) {
      expect(FLAG_SVG[c.iso2]).toMatch(/^<svg[\s\S]*<\/svg>$/);
    }
  });

  it('Thailand is the home-market default', () => {
    expect(DEFAULT_COUNTRY_ISO2).toBe('th');
    expect(findCountry('th').dialCode).toBe('+66');
  });

  // The `?? COUNTRIES[0]` fallback: an iso2 the list does not carry must still yield a country,
  // never `undefined` — the picker renders `findCountry(...).dialCode` unconditionally.
  it('falls back to the first country for an unknown iso2', () => {
    const fallback = findCountry('zz');
    expect(fallback).toBe(COUNTRIES[0]);
    expect(fallback.iso2).toBe(DEFAULT_COUNTRY_ISO2);
  });

  describe('toE164', () => {
    it('prefixes the dial code and strips a leading trunk 0 + separators (TH)', () => {
      expect(toE164('+66', '081-234-5678')).toBe('+66812345678');
      expect(toE164('+66', '0812345678')).toBe('+66812345678');
      expect(toE164('+66', '812345678')).toBe('+66812345678');
    });

    it('handles an already-national number without a leading 0 (e2e seed form)', () => {
      expect(toE164('+66', '800000004')).toBe('+66800000004');
    });

    it('applies other ASEAN dial codes', () => {
      expect(toE164('+95', '9123456789')).toBe('+959123456789'); // Myanmar
      expect(toE164('+65', '81234567')).toBe('+6581234567'); // Singapore
    });

    it('produces backend-valid E.164 (^\\+[1-9]\\d{7,14}$)', () => {
      const e164 = /^\+[1-9]\d{7,14}$/;
      expect(toE164('+66', '0812345678')).toMatch(e164);
      expect(toE164('+855', '12345678')).toMatch(e164);
    });
  });

  describe('countryFromRegion', () => {
    it('maps an in-list device region to its iso2', () => {
      expect(countryFromRegion('TH')).toBe('th');
      expect(countryFromRegion('sg')).toBe('sg');
      expect(countryFromRegion('VN')).toBe('vn');
    });

    it('falls back to the home market for unsupported / missing regions', () => {
      expect(countryFromRegion('US')).toBe('th');
      expect(countryFromRegion(null)).toBe('th');
      expect(countryFromRegion(undefined)).toBe('th');
    });
  });
});
